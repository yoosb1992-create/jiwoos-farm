import type { Session } from "../persistence/store.js";
import type { Member, Command, ActionResult } from "../shared/world.js";
import {
  Client,
  CloseCode,
  Predict,
  type InputHandle,
  type Reconciler,
  type Room,
} from "@colyseus/sdk";
import {
  applyMovement,
  type MovementInput,
  type Position,
} from "../shared/applyMovement.js";
import {
  INTERPOLATION_PROFILES,
  INTERPOLATION_DELAY,
  RECONCILIATION_THRESHOLD,
  ROOM_NAME,
} from "../shared/config.js";
import { FarmState, MoveInput, type Player } from "../shared/schema.js";
import {
  CORRECTION_SMOOTH_MS,
  JOIN_TIMEOUT_MS,
  RECONNECT_MAX_DELAY_MS,
  RECONNECT_MAX_RETRIES,
} from "./config.js";

export type ConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "error";
export interface RenderPlayer {
  id: string;
  nickname: string;
  color: string;
  connected: boolean;
  local: boolean;
  x: number;
  y: number;
  authoritativeX: number;
  authoritativeY: number;
  area: string;
  facing: string;
  moving: boolean;
  running: boolean;
  stamina: number;
  actionTicks: number;
}
export interface NetworkSnapshot {
  status: ConnectionStatus;
  message: string;
  roomId: string;
  sessionId: string;
  players: RenderPlayer[];
  local: { predicted: Position; authoritative: Position } | null;
  rtt: number | null;
  smoothedRtt: number | null;
  tickRate: number | null;
  tick: number;
  patchRate: number;
  correctionDistance: number;
  correctionEma: number;
  correctionPeak: number;
  reconnectCount: number;
  reconnectAttempt: number;
  acknowledgedInputs: number;
  sentInputs: number;
}

/** Backend boundary: the renderer/input controller never imports Colyseus. */
export interface NetworkAdapter {
  create(nickname: string): Promise<void>;
  join(roomId: string, nickname: string): Promise<void>;
  leave(): Promise<void>;
  frame(now: number, command: MovementInput): NetworkSnapshot;
  snapshot(): NetworkSnapshot;
  dispose(): void;
}

type FarmClientRoom = Room<unknown, FarmState>;

export class ColyseusAdapter implements NetworkAdapter {
  private readonly client: Client;
  private room?: FarmClientRoom;
  private predict?: Predict<FarmState>;
  private readonly remotePredictors = new Map<number, Predict<FarmState>>();
  private input?: InputHandle<MoveInput>;
  private me?: Reconciler<Player, MovementInput>;
  private self?: Player;
  private status: ConnectionStatus = "disconnected";
  private message = "방을 만들거나 참가 코드를 입력하세요.";
  private generation = 0;
  private reconnectCount = 0;
  private reconnectAttempt = 0;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private readonly pendingCancels = new Set<() => void>();
  private frozenPlayers: RenderPlayer[] = [];
  private stateTimes: number[] = [];
  private detach: Array<() => void> = [];
  private lastRoomId = "";
  private lastSessionId = "";
  private disposed = false;
  personal?: {
    member: Member;
    chest: Record<string, number>;
    farmId: string;
    events: string[];
  };
  lastAction?: ActionResult;
  onAction?: (result: ActionResult) => void;
  profile: keyof typeof INTERPOLATION_PROFILES = "Stable";
  delay: number = INTERPOLATION_DELAY;
  private lastFrame = 0;
  get state(): FarmState | undefined {
    return this.room?.state;
  }
  openFarm(session: Session): Promise<void> {
    return this.connect(() =>
      this.client.joinOrCreate<FarmState>(
        ROOM_NAME,
        { farmId: session.farmId, token: session.token },
        FarmState,
      ),
    );
  }
  action(command: Command): void {
    if (this.room && this.status === "connected")
      this.room.send("action", command);
  }
  setProfile(profile: keyof typeof INTERPOLATION_PROFILES): void {
    this.profile = profile;
  }

  constructor(url: string) {
    this.client = new Client(url);
  }

  create(nickname: string): Promise<void> {
    return this.connect(() =>
      this.client.create<FarmState>(ROOM_NAME, { nickname }, FarmState),
    );
  }

  join(roomId: string, nickname: string): Promise<void> {
    return this.connect(() =>
      this.client.joinById<FarmState>(roomId.trim(), { nickname }, FarmState),
    );
  }

  private async connect(open: () => Promise<FarmClientRoom>): Promise<void> {
    await this.leave();
    if (this.disposed) return;
    const generation = ++this.generation;
    this.status = "connecting";
    this.message = "서버에 연결하는 중…";
    try {
      const room = await this.openRoom(open);
      if (this.disposed || generation !== this.generation) {
        void this.closeRoom(room);
        return;
      }
      await this.bindRoom(room, generation);
      this.message = "연결됨 · 방 코드를 다른 기기에 입력하세요.";
    } catch (error: unknown) {
      if (generation !== this.generation) return;
      const message = error instanceof Error ? error.message : String(error);
      await this.leave();
      this.status = "error";
      this.message = `연결 실패: ${message}`;
      throw new Error(this.message);
    }
  }

  private async bindRoom(
    room: FarmClientRoom,
    generation: number,
  ): Promise<void> {
    this.room = room;
    room.onMessage(
      "personal",
      (value: NonNullable<ColyseusAdapter["personal"]>) => {
        this.personal = value;
      },
    );
    room.onMessage("actionResult", (value: ActionResult) => {
      this.lastAction = value;
      this.onAction?.(value);
    });
    this.lastRoomId = room.roomId;
    this.lastSessionId = room.sessionId;
    // SDK 0.18.5 auto retry timers cannot be cancelled. Use its documented
    // Client.reconnect API with our own bounded, cancellable timer instead.
    room.reconnection.enabled = false;
    room.reconnection.maxEnqueuedMessages = 0;
    let ready = false;
    const onState = () => {
      this.stateTimes.push(performance.now());
      if (this.stateTimes.length > 120) this.stateTimes.shift();
    };
    const onDrop = () => {
      if (!ready || generation !== this.generation || this.disposed) return;
      const token = room.reconnectionToken;
      this.frozenPlayers = this.snapshot().players.map((player) => ({
        ...player,
        connected: player.local ? false : player.connected,
      }));
      this.status = "reconnecting";
      this.message = "연결이 끊겼습니다. 같은 플레이어로 재연결 중…";
      this.reconnectAttempt = 0;
      this.clearPrediction();
      this.input = undefined;
      this.room = undefined;
      this.detach.splice(0).forEach((unsubscribe) => unsubscribe());
      this.stateTimes = [];
      this.scheduleReconnect(token, generation, performance.now());
    };
    const onLeave = (code: number) => {
      if (generation !== this.generation) return;
      this.status = "disconnected";
      this.message = `연결 종료 (${code}). 같은 코드로 다시 참가하거나 새 방을 만드세요.`;
      this.clearPrediction();
      this.input = undefined;
      this.room = undefined;
      this.frozenPlayers = [];
      this.detach.splice(0).forEach((unsubscribe) => unsubscribe());
    };
    const onError = (code: number, reason?: string) => {
      this.message = `연결 오류 (${code}): ${reason || "서버 주소와 방 코드를 확인하세요."}`;
    };
    room.onStateChange(onState);
    room.onDrop(onDrop);
    room.onLeave(onLeave);
    room.onError(onError);
    this.detach.push(
      () => room.onStateChange.remove(onState),
      () => room.onDrop.remove(onDrop),
      () => room.onLeave.remove(onLeave),
      () => room.onError.remove(onError),
    );
    await this.waitForPlayer(room);
    if (generation !== this.generation)
      throw new Error("연결 작업이 취소되었습니다.");
    this.input = room.input({ type: MoveInput, mode: "reliable" });
    if (!this.input.tickRate)
      throw new Error("서버의 fixed timestep 설정이 없습니다.");
    this.initializePrediction();
    this.frozenPlayers = [];
    this.status = "connected";
    room.send("personal");
    ready = true;
  }

  private scheduleReconnect(
    token: string,
    generation: number,
    started: number,
  ): void {
    if (generation !== this.generation || this.disposed) return;
    if (
      this.reconnectAttempt >= RECONNECT_MAX_RETRIES ||
      performance.now() - started >= 25_000
    ) {
      this.status = "disconnected";
      this.message =
        "재연결에 실패했습니다. 같은 방 코드로 다시 참가하거나 새 방을 만드세요.";
      this.frozenPlayers = [];
      return;
    }
    const delay = Math.min(
      RECONNECT_MAX_DELAY_MS,
      200 * 2 ** this.reconnectAttempt++,
    );
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      void (async () => {
        let candidate: FarmClientRoom | undefined;
        try {
          candidate = await this.openRoom(() =>
            this.client.reconnect<FarmState>(token, FarmState),
          );
          if (generation !== this.generation || this.disposed) {
            await this.closeRoom(candidate);
            return;
          }
          await this.bindRoom(candidate, generation);
          this.reconnectCount++;
          this.message = "재연결 성공 · 입력을 다시 눌러 이동하세요.";
        } catch {
          if (generation !== this.generation || this.disposed) return;
          this.detach.splice(0).forEach((unsubscribe) => unsubscribe());
          this.clearPrediction();
          this.input = undefined;
          this.room = undefined;
          // The server rotates the token at every successful handshake. If
          // that new socket drops before its full state, retry its NEW token.
          // Preserve the reservation: this is recovery, not a consented leave.
          const retryToken = candidate?.reconnectionToken || token;
          if (candidate?.connection.isOpen)
            candidate.connection.close(
              CloseCode.MAY_TRY_RECONNECT,
              "Retry initial state",
            );
          this.status = "reconnecting";
          this.scheduleReconnect(retryToken, generation, started);
        }
      })();
    }, delay);
  }

  private openRoom(
    open: () => Promise<FarmClientRoom>,
  ): Promise<FarmClientRoom> {
    return new Promise((resolve, reject) => {
      let done = false;
      const finish = () => {
        done = true;
        clearTimeout(timeout);
        this.pendingCancels.delete(cancel);
      };
      const cancel = () => {
        if (!done) {
          finish();
          reject(new Error("연결 작업이 취소되었습니다."));
        }
      };
      const timeout = setTimeout(() => {
        if (!done) {
          finish();
          reject(new Error("서버 연결 시간이 초과되었습니다."));
        }
      }, JOIN_TIMEOUT_MS);
      this.pendingCancels.add(cancel);
      void open().then(
        (room) => {
          if (done) {
            void this.closeRoom(room);
            return;
          }
          finish();
          resolve(room);
        },
        (error: unknown) => {
          if (!done) {
            finish();
            reject(error);
          }
        },
      );
    });
  }

  private waitForPlayer(room: FarmClientRoom): Promise<void> {
    if (room.state?.players?.has(room.sessionId)) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timeout);
        room.onStateChange.remove(check);
        room.onLeave.remove(failed);
        this.pendingCancels.delete(failed);
      };
      const check = () => {
        if (room.state?.players?.has(room.sessionId)) {
          cleanup();
          resolve();
        }
      };
      const failed = () => {
        cleanup();
        reject(new Error("초기 상태 수신 전에 연결이 종료되었습니다."));
      };
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error("초기 상태 수신 시간이 초과되었습니다."));
      }, JOIN_TIMEOUT_MS);
      room.onStateChange(check);
      room.onLeave(failed);
      this.pendingCancels.add(failed);
    });
  }

  private initializePrediction(): void {
    const room = this.room;
    const input = this.input;
    const self = room?.state.players.get(room.sessionId);
    if (!room || !input || !self) return;
    this.clearPrediction();
    this.self = self;
    const predict = Predict.get(room, {
      mode: "lerp",
      delay: INTERPOLATION_DELAY,
    });
    predict.attachAll("players", { mode: "lerp", fields: ["x", "y"] });
    // SDK 0.18 attachAll owns a frozen group profile. Keep three supported
    // predictors warm and blend their outputs during profile transitions;
    // changing defaults alone would leave the attached group at 100 ms.
    this.remotePredictors.set(INTERPOLATION_DELAY, predict);
    for (const delay of [
      INTERPOLATION_PROFILES.Fast,
      INTERPOLATION_PROFILES.Aggressive,
    ]) {
      const remote = Predict.get(room, { mode: "lerp", delay });
      remote.attachAll("players", { mode: "lerp", fields: ["x", "y"] });
      this.remotePredictors.set(delay, remote);
    }
    this.me = predict.reconciler(self, {
      input,
      // Only deterministic movement fields belong in rollback; nickname and
      // connection state remain authoritative metadata read off the schema.
      fields: [
        "x",
        "y",
        "area",
        "stamina",
        "facing",
        "moving",
        "running",
        "actionTicks",
      ],
      step: (ctx, state, command) => applyMovement(state, command, ctx.dt),
      smoothMs: CORRECTION_SMOOTH_MS,
      warnOnDivergence: RECONCILIATION_THRESHOLD,
    });
    this.predict = predict;
  }

  frame(now: number, command: MovementInput): NetworkSnapshot {
    const room = this.room;
    const target = INTERPOLATION_PROFILES[this.profile];
    const dt = this.lastFrame ? Math.min(50, now - this.lastFrame) : 16;
    this.lastFrame = now;
    this.delay +=
      Math.sign(target - this.delay) *
      Math.min(Math.abs(target - this.delay), dt * 0.08);
    for (const remote of this.remotePredictors.values())
      if (remote !== this.predict) remote.tick(now);
    if (
      room &&
      this.input &&
      this.status === "connected" &&
      room.connection.isOpen
    ) {
      if (this.self !== room.state.players.get(room.sessionId))
        this.initializePrediction();
      if (this.predict) {
        const steps = this.predict.tick(now);
        for (let step = 0; step < steps; step++) {
          this.input.data.moveX = command.moveX;
          this.input.data.moveY = command.moveY;
          this.input.data.run = command.run;
          this.input.send();
        }
      }
    } else {
      // No input is queued while offline. Reconnect creates a fresh handle
      // and predictor from the new full authoritative state.
      this.predict?.tick(now);
    }
    return this.snapshot();
  }

  private renderCoordinate(
    player: Player,
    field: "x" | "y",
    local: boolean,
  ): number {
    if (local) return this.predict?.value(player, field) ?? player[field];
    const { Aggressive, Fast, Stable } = INTERPOLATION_PROFILES;
    const low = this.delay <= Fast ? Aggressive : Fast,
      high = this.delay <= Fast ? Fast : Stable;
    const a =
      this.remotePredictors.get(low)?.value(player, field) ?? player[field];
    const b =
      this.remotePredictors.get(high)?.value(player, field) ?? player[field];
    return (
      a + (b - a) * Math.max(0, Math.min(1, (this.delay - low) / (high - low)))
    );
  }
  snapshot(): NetworkSnapshot {
    const room = this.room;
    const now = performance.now();
    const samples = this.stateTimes.filter((time) => time >= now - 2_000);
    const first = samples[0];
    const last = samples.at(-1);
    const patchRate =
      first !== undefined && last !== undefined && last > first
        ? ((samples.length - 1) * 1_000) / (last - first)
        : 0;
    const players: RenderPlayer[] = room
      ? []
      : this.frozenPlayers.map((player) => ({ ...player }));
    room?.state?.players?.forEach((player, id) => {
      players.push({
        id,
        nickname: player.nickname,
        color: player.color,
        connected: player.connected,
        local: id === room.sessionId,
        x: this.renderCoordinate(player, "x", id === room.sessionId),
        y: this.renderCoordinate(player, "y", id === room.sessionId),
        authoritativeX: player.x,
        authoritativeY: player.y,
        area: player.area,
        facing: player.facing,
        moving: player.moving,
        running: player.running,
        stamina: player.stamina,
        actionTicks: player.actionTicks,
      });
    });
    const local =
      this.me && this.self
        ? {
            predicted: { x: this.me.state.x, y: this.me.state.y },
            authoritative: { x: this.self.x, y: this.self.y },
          }
        : null;
    const haveRtt = (this.input?.lastProcessed ?? 0) > 0;
    return {
      status: this.status,
      message: this.message,
      roomId: room?.roomId ?? this.lastRoomId,
      sessionId: room?.sessionId ?? this.lastSessionId,
      players,
      local,
      rtt: room && haveRtt ? room.clock.rtt() : null,
      smoothedRtt: room && haveRtt ? room.clock.smoothedRtt() : null,
      tickRate: this.input?.tickRate ?? null,
      tick: room?.state?.tick ?? 0,
      patchRate,
      // This is the replay correction at the acknowledged input, not the
      // expected predicted-authoritative lead caused by network transit time.
      correctionDistance: this.me
        ? Math.hypot(
            this.me.lastCorrection.x ?? 0,
            this.me.lastCorrection.y ?? 0,
          )
        : 0,
      correctionEma: this.me?.drift.ema ?? 0,
      correctionPeak: this.me?.drift.peak ?? 0,
      reconnectCount: this.reconnectCount,
      reconnectAttempt: this.reconnectAttempt,
      acknowledgedInputs: this.input?.lastProcessed ?? 0,
      sentInputs: this.input?.sentCount ?? 0,
    };
  }

  private clearPrediction(): void {
    for (const remote of this.remotePredictors.values())
      if (remote !== this.predict) remote.dispose();
    this.remotePredictors.clear();
    this.predict?.dispose();
    this.predict = undefined;
    this.me = undefined;
    this.self = undefined;
  }

  async leave(): Promise<void> {
    ++this.generation;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
    this.pendingCancels.forEach((cancel) => cancel());
    this.pendingCancels.clear();
    const room = this.room;
    this.room = undefined;
    this.input = undefined;
    this.clearPrediction();
    this.detach.splice(0).forEach((unsubscribe) => unsubscribe());
    this.stateTimes = [];
    this.frozenPlayers = [];
    this.reconnectAttempt = 0;
    this.status = "disconnected";
    this.message = "방을 만들거나 참가 코드를 입력하세요.";
    if (!room) return;
    await this.closeRoom(room);
  }

  private async closeRoom(room: FarmClientRoom): Promise<void> {
    room.reconnection.enabled = false;
    room.reconnection.enqueuedMessages.length = 0;
    if (!room.connection.isOpen) {
      room.connection.close(1000, "Left lab");
      return;
    }
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        room.connection.close(1000, "Left lab");
        resolve();
      }, 1_500);
      void room
        .leave(true)
        .catch(() => room.connection.close())
        .finally(() => {
          clearTimeout(timer);
          resolve();
        });
    });
  }

  dispose(): void {
    this.disposed = true;
    void this.leave();
  }
}
