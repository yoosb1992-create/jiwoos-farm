import {
  ClientState,
  CloseCode,
  Room,
  type Client,
  type StepContext,
} from "@colyseus/core";
import {
  applyMovement,
  sanitizeMovementInput,
} from "../shared/applyMovement.js";
import {
  CATCHUP_CREDIT_EXPIRY_MS,
  INPUT_BACKLOG_RESYNC_THRESHOLD,
  INPUT_BACKLOG_RESYNC_TIMEOUT_MS,
  INPUT_BUFFER_SIZE,
  MAX_CATCHUP_CREDITS,
  MAX_CATCHUP_INPUTS_PER_TICK,
  MAX_MESSAGES_PER_SECOND,
  MAX_PLAYERS,
  PATCH_INTERVAL_MS,
  PLAYER_COLORS,
  RECONNECTION_SECONDS,
  SERVER_TICK_RATE,
} from "../shared/config.js";
import type { MapData } from "../shared/content.js";
import { FarmState, MoveInput, Player } from "../shared/schema.js";

function nicknameFrom(value: unknown): string {
  if (typeof value !== "string") return "Player";
  return (
    [...value.replace(/\p{Cc}/gu, "").trim()].slice(0, 20).join("") || "Player"
  );
}

export class MovementRoom extends Room<{ state: FarmState; input: MoveInput }> {
  state = new FarmState();
  maxClients = MAX_PLAYERS;
  maxMessagesPerSecond = MAX_MESSAGES_PER_SECOND;
  /** Server-only override for isolated integration tests; never read join options. */
  protected movementMaps?: Record<string, MapData>;
  protected afterMovement(_context: StepContext): void {}
  protected reconnectionSeconds = RECONNECTION_SECONDS;
  private readonly catchupBudgets = new Map<
    string,
    {
      credits: number;
      lastInputTick: number | undefined;
      expiresAtTick: number;
      backlogSinceTick: number | undefined;
      backlogMinimum: number;
      resyncRequested: boolean;
    }
  >();

  inputs = this.defineInput(MoveInput, {
    bufferMaxSize: INPUT_BUFFER_SIZE,
    sanitize: (frame: MoveInput) => {
      const sanitized = sanitizeMovementInput(frame);
      frame.moveX = sanitized.moveX;
      frame.moveY = sanitized.moveY;
      frame.run = sanitized.run;
    },
  });

  protected startMovement(): void {
    this.setPatchRate(PATCH_INTERVAL_MS);
    this.setFixedTimestep((context) => this.step(context), SERVER_TICK_RATE);
    // Unrecognized application messages are deliberately ignored. In particular,
    // "position" / "move" messages cannot write any authoritative field.
    this.onMessage("*", () => undefined);
  }

  protected addPlayer(client: Client, options?: unknown): void {
    const nickname =
      options !== null && typeof options === "object"
        ? nicknameFrom((options as Record<string, unknown>).nickname)
        : "Player";
    const usedColors = new Set(
      [...this.state.players.values()].map((player) => player.color),
    );
    const color =
      PLAYER_COLORS.find((candidate) => !usedColors.has(candidate)) ??
      PLAYER_COLORS[0]!;
    const slot = PLAYER_COLORS.indexOf(color);
    this.state.players.set(
      client.sessionId,
      new Player({
        x: 96 + slot * 44,
        y: 96,
        nickname,
        color,
        connected: true,
      }),
    );
    this.resetCatchupBudget(client.sessionId);
  }

  protected resetCatchupBudget(sessionId: string): void {
    this.catchupBudgets.set(sessionId, {
      credits: 0,
      lastInputTick: undefined,
      expiresAtTick: 0,
      backlogSinceTick: undefined,
      backlogMinimum: 0,
      resyncRequested: false,
    });
  }

  private step(context: StepContext): void {
    this.state.tick = context.tick;
    for (const [sessionId, player] of this.state.players) {
      const client = this.clients.get(sessionId);
      if (!player.connected || client?.state !== ClientState.JOINED) continue;
      const budget = this.catchupBudgets.get(sessionId);
      if (!budget || budget.resyncRequested) continue;
      const expiryTicks = Math.ceil(CATCHUP_CREDIT_EXPIRY_MS / context.dtMs);
      const recentlyActive =
        budget.lastInputTick !== undefined &&
        context.tick - budget.lastInputTick <= expiryTicks;
      if (!recentlyActive || context.tick > budget.expiresAtTick)
        budget.credits = 0;
      const channel = this.inputs.get(sessionId);
      const input = channel.next();
      if (!input) {
        budget.backlogSinceTick = undefined;
        budget.backlogMinimum = 0;
        // Credit only recently active connections for a missing packet. A newly
        // joined or long-idle client cannot bank movement time before playing.
        if (recentlyActive) {
          if (budget.credits === 0)
            budget.expiresAtTick = context.tick + expiryTicks;
          budget.credits = Math.min(MAX_CATCHUP_CREDITS, budget.credits + 1);
        }
        continue;
      }
      applyMovement(player, input, context.dt, this.movementMaps);
      budget.lastInputTick = context.tick;
      // One normal step, plus at most one previously missed step. Credits are
      // spent, never minted while input is available: total integrated time is
      // bounded by the connected server ticks, even if the client floods us.
      // Consume AND simulate every extra frame, keeping protocol ack exact.
      for (
        let count = 1;
        count < MAX_CATCHUP_INPUTS_PER_TICK && budget.credits > 0;
        count += 1
      ) {
        const catchup = channel.next();
        if (!catchup) break;
        applyMovement(player, catchup, context.dt, this.movementMaps);
        budget.credits -= 1;
      }
      // A TCP stall longer than the bounded catch-up window can leave a queue
      // that never shrinks at equal client/server rates. Request a new input
      // epoch instead of preserving that delay indefinitely. A fresh lower
      // minimum counts as progress; ordinary +/-1 packet jitter does not keep
      // postponing the timeout. The clock is the room tick, so no timer leaks.
      if (channel.size < INPUT_BACKLOG_RESYNC_THRESHOLD) {
        budget.backlogSinceTick = undefined;
        budget.backlogMinimum = 0;
      } else if (
        budget.backlogSinceTick === undefined ||
        channel.size < budget.backlogMinimum
      ) {
        budget.backlogSinceTick = context.tick;
        budget.backlogMinimum = channel.size;
      } else if (
        (context.tick - budget.backlogSinceTick) * context.dtMs >=
        INPUT_BACKLOG_RESYNC_TIMEOUT_MS
      ) {
        budget.resyncRequested = true;
        client.leave(CloseCode.MAY_TRY_RECONNECT, "Input backlog resync");
      }
    }
    this.afterMovement(context);
  }

  onDrop(client: Client, code?: number): void {
    const player = this.state.players.get(client.sessionId);
    if (player) player.connected = false;
    this.resetCatchupBudget(client.sessionId);
    // Colyseus freezes this input stream on drop and discards pending commands;
    // a restored connection receives fresh state and rebases its prediction.
    if (code === CloseCode.WITH_ERROR || this.reconnectionSeconds <= 0) return;
    // Colyseus invokes onLeave after grace expiry. Returning immediately avoids
    // keeping transport closure waiting for an unresolved reconnection promise.
    this.allowReconnection(client, this.reconnectionSeconds).catch(
      () => undefined,
    );
  }

  onReconnect(client: Client): void {
    const player = this.state.players.get(client.sessionId);
    if (player) player.connected = true;
    this.resetCatchupBudget(client.sessionId);
  }

  protected removePlayer(client: Client): void {
    this.state.players.delete(client.sessionId);
    this.catchupBudgets.delete(client.sessionId);
  }

  protected disposeMovement(): void {
    this.catchupBudgets.clear();
  }
}

export function configuredMovementRoom(
  reconnectionSeconds: number,
): typeof MovementRoom {
  return class ConfiguredMovementRoom extends MovementRoom {
    protected override reconnectionSeconds = reconnectionSeconds;
  };
}
