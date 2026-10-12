import { appearanceOf, type Appearance } from "../shared/appearance.js";
import type { TransportFx } from "../shared/transport.js";
import { CLIENT_MAPS, receiveLayout } from "./layout.js";
import type { Session } from "../persistence/store.js";
import type { Member, Command, ActionResult } from "../shared/world.js";
import type { ActionFx } from "../shared/interaction.js";
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
  collidesWithObstacle,
  prepareDynamicObstacles,
  type DynamicObstacleIndex,
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
  RECONNECT_BASE_DELAY_MS,
  RECONNECT_SESSION_MS,
  CONNECTION_STALE_MS,
} from "./config.js";

export type ConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "error";
export interface RenderPlayer {
  appearance?: Appearance;
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
  carrying?: boolean;
  carry?: string;
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

/** Close half-open sockets as well as HTTP matchmaking when an attempt times out. */
class FarmConnectionClient extends Client {
  readonly openingRooms = new Set<Room>();
  protected override createRoom<T>(name: string, schema?: new (...args: any[]) => T) {
    const room = super.createRoom(name, schema);
    room.reconnection.enabled = false;
    room.reconnection.maxEnqueuedMessages = 0;
    this.openingRooms.add(room);
    return room;
  }
}

export function terminalConnectionError(error: unknown): boolean {
  const value = error as { code?: number; status?: number; message?: string } | undefined;
  return [401, 403, 1008, 4000, 4002].includes(Number(value?.code ?? value?.status)) ||
    /세션이 만료|세션 없음|가족 세션이 일치|잘못된 가족|가족 코드|Invalid token|unauthorized|forbidden|access denied|onAuth failed|fixed timestep/i.test(value?.message ?? "");
}
export function reconnectDelay(attempt: number): number {
  const base = Math.min(RECONNECT_MAX_DELAY_MS, RECONNECT_BASE_DELAY_MS * 2 ** Math.min(attempt, 5));
  return Math.round(base * (.85 + Math.random() * .15));
}

export class ColyseusAdapter implements NetworkAdapter {
  private readonly client: FarmConnectionClient;
  private room?: FarmClientRoom;
  private predict?: Predict<FarmState>;
  private readonly remotePredictors = new Map<number, Predict<FarmState>>();
  private input?: InputHandle<MoveInput>;
  private me?: Reconciler<Player, MovementInput>;
  private self?: Player;
  private obstacleIndex?: DynamicObstacleIndex;
  private obstacleRoom?: FarmClientRoom;
  private obstacleRevision = -1;
  private obstacleCount = -1;
  private collisionIndex(room: FarmClientRoom): DynamicObstacleIndex | undefined {
    if (!this.obstacleIndex || this.obstacleRoom !== room ||
        this.obstacleRevision !== room.state.revision ||
        this.obstacleCount !== room.state.entities.size) {
      this.obstacleIndex = prepareDynamicObstacles(room.state.entities.values());
      this.obstacleRoom = room;
      this.obstacleRevision = room.state.revision;
      this.obstacleCount = room.state.entities.size;
    }
    return this.obstacleIndex;
  }
  private connectionStatus: ConnectionStatus = "disconnected";
  onConnection?: (status: ConnectionStatus) => void;
  private get status(): ConnectionStatus {
    return this.connectionStatus;
  }
  private set status(value: ConnectionStatus) {
    if (this.connectionStatus === value) return;
    this.connectionStatus = value;
    this.onConnection?.(value);
  }
  private message = "방을 만들거나 참가 코드를 입력하세요.";
  private generation = 0;
  private reconnectCount = 0;
  private reconnectAttempt = 0;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private wakeRetry?: () => void;
  private reopen?: () => Promise<FarmClientRoom>;
  private recoveryToken = "";
  private recoveryStarted = 0;
  private recovery?: { generation: number; promise: Promise<void> };
  private lastStateAt = 0;
  private dropCurrent?: () => void;
  private savedToken = "";
  private lastWakeAt = 0;
  private readonly pendingCancels = new Set<() => void>();
  private frozenPlayers: RenderPlayer[] = [];
  private stateTimes: number[] = [];
  private detach: Array<() => void> = [];
  private lastRoomId = "";
  private lastSessionId = "";
  private disposed = false;
  personal?: {
    canDevelop?: boolean;
    member: Member;
    chestStores?: Record<string, Record<string, number>>;
    chestStorageKeys?: Record<string, string>;
    chestInfos?: Record<string, import("../shared/chest-storage.js").ChestInfo>;
    legacyChestTarget?: string;
    sleepVoted?: boolean;
    farmId: string;
    events: string[];
  };
  lastAction?: ActionResult;
  onAction?: (result: ActionResult) => void;
  onTransportFx?: (event: TransportFx) => void;
  onActionFx?: (event: ActionFx) => void;
  profile: keyof typeof INTERPOLATION_PROFILES = "Stable";
  delay: number = INTERPOLATION_DELAY;
  private lastFrame = 0;
  get state(): FarmState | undefined {
    return this.room?.state;
  }
  openFarm(session: Session, initialAppearance?: Appearance): Promise<void> {
    if (this.savedToken === session.token && this.status === "connected") return Promise.resolve();
    if (this.savedToken === session.token && this.recovery?.generation === this.generation)
      return this.recovery.promise;
    return this.connect(() =>
      this.client.joinOrCreate<FarmState>(
        ROOM_NAME,
        { farmId: session.farmId, token: session.token, initialAppearance },
        FarmState,
      ), session.token,
    );
  }
  action(command: Command): void {
    if (this.room && this.status === "connected" && this.room.connection.isOpen)
      this.room.send("action", command);
  }
  setProfile(profile: keyof typeof INTERPOLATION_PROFILES): void {
    this.profile = profile;
  }

  constructor(url: string) {
    this.client = new FarmConnectionClient(url);
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

  private async connect(open: () => Promise<FarmClientRoom>, savedToken = ""): Promise<void> {
    const closing = this.leave();
    const generation = this.generation;
    this.savedToken = savedToken;
    await closing;
    if (this.disposed || generation !== this.generation) return;
    // Only authenticated farm joins can safely be replayed. Never recreate a farm.
    this.reopen = savedToken ? open : undefined;
    this.message = "서버에 연결하는 중…";
    this.status = "connecting";
    await this.recover(generation, open);
  }

  private recover(generation: number, firstOpen?: () => Promise<FarmClientRoom>): Promise<void> {
    if (this.recovery?.generation === generation) return this.recovery.promise;
    const promise = this.recoverLoop(generation, firstOpen).finally(() => {
      if (this.recovery?.generation === generation) this.recovery = undefined;
    });
    this.recovery = { generation, promise };
    return promise;
  }

  private async recoverLoop(generation: number, firstOpen?: () => Promise<FarmClientRoom>): Promise<void> {
    while (!this.disposed && generation === this.generation) {
      let candidate: FarmClientRoom | undefined;
      const token = Date.now() - this.recoveryStarted < RECONNECT_SESSION_MS ? this.recoveryToken : "";
      const open = firstOpen ?? (token ? () => this.client.reconnect<FarmState>(token, FarmState) : this.reopen);
      firstOpen = undefined;
      if (!open) {
        this.message = "세션 복구 시간이 지났어요. 저장된 농장을 다시 선택해 주세요.";
        this.status = "error";
        return;
      }
      try {
        candidate = await this.openRoom(open);
        if (generation !== this.generation || this.disposed) { void this.closeRoom(candidate); return; }
        await this.bindRoom(candidate, generation);
        if (generation !== this.generation) return;
        if (this.reconnectAttempt || this.recoveryToken) this.reconnectCount++;
        this.reconnectAttempt = 0;
        this.recoveryToken = "";
        this.message = "연결이 복구됐어요.";
        return;
      } catch (error) {
        if (generation !== this.generation || this.disposed) return;
        this.detachRoom();
        // A handshake rotates the short-lived token, even if its state is lost.
        if (candidate?.reconnectionToken) {
          this.recoveryToken = candidate.reconnectionToken;
          this.recoveryStarted = Date.now();
        } else if (token && ([522, 524].includes(Number((error as {code?: number})?.code)) ||
          /reconnection|room.*not found|room.*does not exist|room.*disposed|seat reservation/i.test(String((error as Error)?.message)))) {
          this.recoveryToken = "";
        }
        if (candidate?.connection.isOpen)
          candidate.connection.close(CloseCode.MAY_TRY_RECONNECT, "Retry initial state");
        if (terminalConnectionError(error) || (!this.reopen && !this.recoveryToken)) {
          this.reopen = undefined;
          this.recoveryToken = "";
          this.message = `연결할 수 없어요: ${error instanceof Error ? error.message : String(error)}`;
          this.status = "error";
          throw new Error(this.message);
        }
        this.message = "자동으로 다시 연결하고 있어요…";
        this.status = "reconnecting";
        await this.waitToRetry(generation);
      }
    }
  }

  private waitToRetry(generation: number): Promise<void> {
    const delay = reconnectDelay(this.reconnectAttempt++);
    this.lastWakeAt = Date.now();
    return new Promise(resolve => {
      const finish = () => {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = undefined;
        this.wakeRetry = undefined;
        this.pendingCancels.delete(finish);
        resolve();
      };
      this.wakeRetry = finish;
      this.pendingCancels.add(finish);
      this.reconnectTimer = setTimeout(finish, delay);
      if (generation !== this.generation) finish();
    });
  }

  private detachRoom(): void {
    this.dropCurrent = undefined;
    this.detach.splice(0).forEach(unsubscribe => unsubscribe());
    this.clearPrediction();
    this.input = undefined;
    this.room = undefined;
    this.stateTimes = [];
  }

  /** Android can suspend timers without closing a half-open WebSocket. Rebase
   * from server state after a long silence instead of replaying suspended input. */
  resumeConnection(): void {
    if (this.disposed) return;
    if (this.status === "connected") {
      if (!this.room?.connection.isOpen || Date.now() - this.lastStateAt > CONNECTION_STALE_MS) {
        const stale = this.room;
        this.dropCurrent?.();
        stale?.connection.close(CloseCode.MAY_TRY_RECONNECT, "Resume stale connection");
      }
    } else if (this.status === "reconnecting" && Date.now() - this.lastWakeAt > 1_000) {
      this.lastWakeAt = Date.now();
      this.wakeRetry?.();
    }
  }

  private async bindRoom(
    room: FarmClientRoom,
    generation: number,
  ): Promise<void> {
    this.room = room;
    this.personal = undefined;
    room.onMessage(
      "personal",
      (value: NonNullable<ColyseusAdapter["personal"]>) => {
        if (this.room === room && generation === this.generation) this.personal = value;
      },
    );
    room.onMessage("actionResult", (value: ActionResult) => {
      if (this.room !== room || generation !== this.generation) return;
      this.lastAction = value;
      this.onAction?.(value);
    });
    room.onMessage("transportFx", (value: TransportFx) => this.onTransportFx?.(value));
    room.onMessage("actionFx", (value: ActionFx) => this.onActionFx?.(value));
    this.lastRoomId = room.roomId;
    this.lastSessionId = room.sessionId;
    // SDK 0.18.5 auto retry timers cannot be cancelled. Use its documented
    // Client.reconnect API with our own cancellable recovery loop instead.
    room.reconnection.enabled = false;
    room.reconnection.maxEnqueuedMessages = 0;
    let ready = false;
    const onState = () => {
      receiveLayout(room.state.layout);
      this.lastStateAt = Date.now();
      this.stateTimes.push(performance.now());
      if (this.stateTimes.length > 120) this.stateTimes.shift();
    };
    const onDrop = () => {
      if (!ready || this.room !== room || generation !== this.generation || this.disposed) return;
      this.recoveryToken = room.reconnectionToken;
      this.recoveryStarted = Date.now();
      this.frozenPlayers = this.snapshot().players.map(player => ({
        ...player, connected: player.local ? false : player.connected,
      }));
      this.detachRoom();
      this.message = "연결이 끊겼어요. 자동으로 다시 연결하고 있어요…";
      this.status = "reconnecting";
      this.reconnectAttempt = 0;
      // onDrop/onLeave may both fire for one socket; detachment makes this single-flight.
      void (async () => {
        await this.waitToRetry(generation);
        if (generation === this.generation && !this.disposed)
          await this.recover(generation);
      })().catch(() => undefined); // terminal errors are displayed in status/message
    };
    const onLeave = (code: number, reason?: string) => {
      if (!ready || this.room !== room || generation !== this.generation) return;
      if ([1001, 1005, 1006, 1011, 1012, 1013, 4001, 4003, 4010].includes(code)) { onDrop(); return; }
      this.detachRoom();
      this.reopen = undefined;
      this.recoveryToken = "";
      this.message = code === CloseCode.CONSENTED
        ? "다른 연결에서 이 플레이어로 접속했거나 농장에서 나갔어요."
        : `접속이 종료됐어요 (${code}). ${reason ?? "접근 권한을 확인해 주세요."}`;
      this.status = "error";
      if (room.connection.isOpen) void this.closeRoom(room);
    };
    const onError = (code: number, reason?: string) => {
      if (ready && terminalConnectionError({ code, message: reason })) onLeave(code, reason);
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
    room.send("personal");
    await this.waitForPlayer(room);
    if (generation !== this.generation)
      throw new Error("연결 작업이 취소되었습니다.");
    this.input = room.input({ type: MoveInput, mode: "reliable" });
    if (!this.input.tickRate)
      throw new Error("서버의 fixed timestep 설정이 없습니다.");
    receiveLayout(room.state.layout);
    this.initializePrediction();
    this.frozenPlayers = [];
    this.lastStateAt = Date.now();
    this.dropCurrent = onDrop;
    ready = true;
    this.message = "연결이 복구됐어요.";
    this.status = "connected";
  }

  private openRoom(
    open: () => Promise<FarmClientRoom>,
  ): Promise<FarmClientRoom> {
    return new Promise((resolve, reject) => {
      let done = false;
      const controller = new AbortController();
      this.client.http.options.signal = controller.signal;
      const cancelTransport = () => {
        controller.abort();
        for (const room of this.client.openingRooms) room.connection?.close(CloseCode.NORMAL_CLOSURE, "Cancelled connection attempt");
        this.client.openingRooms.clear();
      };
      const finish = () => {
        done = true;
        clearTimeout(timeout);
        this.pendingCancels.delete(cancel);
        this.client.openingRooms.clear();
      };
      const cancel = () => {
        if (!done) {
          cancelTransport();
          finish();
          reject(new Error("연결 작업이 취소되었습니다."));
        }
      };
      const timeout = setTimeout(() => {
        if (!done) {
          cancelTransport();
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
            cancelTransport();
            finish();
            reject(error);
          }
        },
      );
    });
  }

  private waitForPlayer(room: FarmClientRoom): Promise<void> {
    const isReady = () => room.state?.players?.has(room.sessionId) &&
      this.personal?.member.id === room.state.players.get(room.sessionId)?.playerId;
    if (isReady()) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timeout);
        room.onStateChange.remove(check);
        room.onLeave.remove(failed);
        room.onError.remove(failed);
        offPersonal();
        this.pendingCancels.delete(failed);
      };
      const check = () => {
        if (isReady()) {
          cleanup();
          resolve();
        }
      };
      const failed = (code?: number, reason?: string) => {
        cleanup();
        reject(Object.assign(new Error(reason || "초기 상태 수신 전에 연결이 종료되었습니다."), { code }));
      };
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error("초기 상태 수신 시간이 초과되었습니다."));
      }, JOIN_TIMEOUT_MS);
      const offPersonal = room.onMessage("personal", check);
      room.onStateChange(check);
      room.onLeave(failed);
      room.onError(failed);
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
        "carrying",
      ],
      step: (ctx, state, command) =>
        applyMovement(
          state,
          command,
          ctx.dt,
          CLIENT_MAPS,
          this.collisionIndex(room),
        ),
      smoothMs: CORRECTION_SMOOTH_MS,
      warnOnDivergence: RECONCILIATION_THRESHOLD,
    });
    this.predict = predict;
  }

  frame(now: number, command: MovementInput): NetworkSnapshot {
    if (this.status === "connected") this.resumeConnection();
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
          this.input.data.faceX = command.faceX ?? 0;
          this.input.data.faceY = command.faceY ?? 0;
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
    const obstacles = room?.state ? this.collisionIndex(room) : undefined;
    room?.state?.players?.forEach((player, id) => {
      const local = id === room.sessionId;
      const rx = this.renderCoordinate(player, "x", local);
      const ry = this.renderCoordinate(player, "y", local);
      // Prediction smoothing must not render the actor inside a blocked tile.
      const unsafeVisual = collidesWithObstacle(rx, ry, player.area, CLIENT_MAPS, obstacles);
      players.push({
        id,
        nickname: player.nickname,
        color: player.color,
        connected: player.connected,
        local,
        x: unsafeVisual ? player.x : rx,
        y: unsafeVisual ? player.y : ry,
        authoritativeX: player.x,
        authoritativeY: player.y,
        area: player.area,
        facing: player.facing,
        moving: player.moving,
        running: player.running,
        stamina: player.stamina,
        actionTicks: player.actionTicks,
        appearance: appearanceOf(player.appearance),
        carrying: player.carrying, carry: player.carry,
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
    this.obstacleIndex = undefined;
    this.obstacleRoom = undefined;
    this.obstacleRevision = -1;
    this.obstacleCount = -1;
  }

  async leave(): Promise<void> {
    ++this.generation;
    this.reopen = undefined;
    this.recoveryToken = "";
    this.savedToken = "";
    this.pendingCancels.forEach(cancel => cancel());
    this.pendingCancels.clear();
    const room = this.room;
    this.detachRoom();
    this.personal = undefined;
    this.lastRoomId = "";
    this.lastSessionId = "";
    this.frozenPlayers = [];
    this.reconnectAttempt = 0;
    this.message = "저장된 농장을 선택하거나 가족 코드로 참가하세요.";
    this.status = "disconnected";
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
