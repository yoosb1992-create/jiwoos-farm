import { ServerError, type Client } from "@colyseus/core";
import { MovementRoom } from "./MovementRoom.js";
import { WorldEntity, type Player } from "../shared/schema.js";
import { applyAction, parseCommand } from "../shared/actions.js";
import {
  newMember,
  ACTION_COOLDOWN_MS,
  CHECKPOINT_MS,
  GAME_MINUTE_MS,
  type World,
  type Actor,
  type ActionResult,
} from "../shared/world.js";
import {
  tokenHash,
  type Store,
  type FarmLease,
  type Identity,
} from "../persistence/store.js";
import { TILE } from "../shared/content.js";

/** One logical authority per family. PostgreSQL session advisory lease fences overlapping deploys. */
export function configuredFarmRoom(store: Store): typeof FarmRoom {
  return class extends FarmRoom {
    protected override store = store;
  };
}
export class FarmRoom extends MovementRoom {
  protected store!: Store;
  private lease!: FarmLease;
  private world!: World;
  private farmId = "";
  private queue: Promise<unknown> = Promise.resolve();
  private pending = 0;
  private readonly identities = new Map<string, Identity>();
  private readonly activeMembers = new Set<string>();
  private readonly cooldown = new Map<string, number>();
  private votes = new Set<string>();
  private timer?: ReturnType<typeof setInterval>;
  private checkpointTimer?: ReturnType<typeof setInterval>;
  private closing = false;
  private clockStarted = Date.now();
  private clockMinute = 360;
  private clockDay = 1;
  private dueCheckpoint = false;
  private enqueue<T>(job: () => Promise<T>): Promise<T> {
    const next = this.queue.then(job);
    this.queue = next.catch(() => undefined);
    return next;
  }
  async onCreate(options: {
    farmId?: unknown;
    token?: unknown;
  }): Promise<void> {
    const identity = await this.store.authenticate(
      typeof options.token === "string" ? options.token : "",
    );
    if (identity.farmId !== options.farmId)
      throw new ServerError(403, "가족 세션이 일치하지 않습니다");
    this.farmId = identity.farmId;
    this.autoDispose = true;
    this.lease = await this.store.lease(this.farmId, () => {
      this.state.storage = "offline";
      void this.disconnect(4010);
    });
    this.world = await this.lease.load();
    this.clockMinute = this.world.minute;
    this.clockDay = this.world.day;
    this.clockStarted = Date.now();
    this.sync();
    this.startMovement();
    this.onMessage("personal", (client) => this.privateState(client));
    this.onMessage("action", (client, value: unknown) => {
      if (this.pending >= 32) {
        client.send("actionResult", {
          ok: false,
          message: "잠시 후 다시 시도하세요",
        });
        return;
      }
      this.pending++;
      void this.enqueue(() => this.command(client, value)).finally(
        () => this.pending--,
      );
    });
    this.timer = setInterval(() => {
      const minute = Math.min(
        1430,
        this.clockMinute +
          Math.floor((Date.now() - this.clockStarted) / GAME_MINUTE_MS),
      );
      this.state.minute = minute;
    }, 500);
    this.checkpointTimer = setInterval(() => {
      if (this.dueCheckpoint || this.closing) return;
      this.dueCheckpoint = true;
      void this.enqueue(() => this.checkpoint()).finally(() => {
        this.dueCheckpoint = false;
      });
    }, CHECKPOINT_MS);
  }
  async onAuth(
    _client: Client,
    options: { token?: unknown },
  ): Promise<Identity> {
    const identity = await this.store.authenticate(
      typeof options.token === "string" ? options.token : "",
    );
    if (identity.farmId !== this.farmId)
      throw new ServerError(403, "잘못된 가족");
    return identity;
  }
  async onJoin(
    client: Client,
    _options: unknown,
    auth: Identity,
  ): Promise<void> {
    // A valid saved token may replace its previous connection on mobile reload.
    for (const [sid, identity] of this.identities)
      if (identity.playerId === auth.playerId) {
        this.identities.delete(sid);
        const old = this.clients.get(sid);
        if (old) this.removePlayer(old);
        else this.state.players.delete(sid);
        this.clients
          .get(sid)
          ?.leave(4000, "Session resumed on another connection");
      }

    this.activeMembers.add(auth.playerId);
    this.identities.set(client.sessionId, auth);
    try {
      await this.enqueue(async () => {
        if (!this.world.members[auth.playerId]) {
          const proposed = this.proposal();
          proposed.members[auth.playerId] = newMember(
            auth.playerId,
            auth.nickname,
          );
          proposed.revision++;
          await this.lease.save(proposed, this.world.revision);
          this.world = proposed;
        }
        this.addPlayer(client, { nickname: auth.nickname });
        const p = this.state.players.get(client.sessionId)!;
        p.playerId = auth.playerId;
        p.x = 7 * TILE;
        p.y = 9 * TILE;
        p.stamina = this.world.members[auth.playerId]!.stamina;
        this.sync();
        this.privateState(client);
      });
    } catch (e) {
      this.activeMembers.delete(auth.playerId);
      this.identities.delete(client.sessionId);
      throw e;
    }
  }
  private proposal(): World {
    const w = structuredClone(this.world);
    w.minute = this.state.minute;
    for (const p of this.state.players.values()) {
      const m = w.members[p.playerId];
      if (m) m.stamina = p.stamina;
    }
    return w;
  }
  private actor(p: Player): Actor {
    return {
      id: p.playerId,
      area: p.area,
      x: p.x,
      y: p.y,
      facing: p.facing,
      running: p.running,
      stamina: p.stamina,
    };
  }
  private async command(client: Client, value: unknown): Promise<void> {
    let actionId = "";
    try {
      if (this.closing) throw new Error("서버를 저장하고 있습니다");
      const identity = this.identities.get(client.sessionId),
        p = this.state.players.get(client.sessionId);
      if (!identity || !p?.connected) throw new Error("접속을 복구하세요");
      const command = parseCommand(value);
      actionId = command.actionId;
      const hash = tokenHash(JSON.stringify(command));
      const receipt = await this.lease.receipt(identity.playerId, actionId);
      if (receipt) {
        if (receipt.hash !== hash) throw new Error("이미 사용한 행동 ID");
        client.send("actionResult", receipt.result);
        this.privateState(client);
        return;
      }
      const now = Date.now();
      if (
        now - (this.cooldown.get(identity.playerId) ?? 0) <
        ACTION_COOLDOWN_MS
      )
        throw new Error("행동 준비 중입니다");
      this.cooldown.set(identity.playerId, now);
      const proposed = this.proposal(),
        votes = new Set(this.votes);
      const beforeDay = proposed.day;
      const actor = this.actor(p);
      const result = applyAction(proposed, actor, command, {
        now,
        online: [...this.state.players.values()]
          .filter((x) => x.connected)
          .map((x) => x.playerId),
        votes,
      });
      // Reserve actor while a durable action is committing. Movement packets cannot alter action range during storage.
      const freeze = command.type !== "plantSeed";
      if (freeze) p.actionTicks = 30;
      try {
        await this.lease.save(proposed, this.world.revision, {
          playerId: identity.playerId,
          actionId,
          hash,
          result,
        });
      } catch (e) {
        p.actionTicks = 0;
        this.state.storage = "error";
        throw e;
      }
      this.world = proposed;
      this.votes = votes;
      // Planting permits walking while storage commits. Preserve any running cost
      // accrued after validation instead of restoring that stamina on commit.
      p.stamina = Math.max(
        0,
        proposed.members[p.playerId]!.stamina -
          Math.max(0, actor.stamina - p.stamina),
      );
      p.actionTicks = freeze ? 6 : 0;
      if (result.transition) {
        p.area = result.transition.area;
        p.x = result.transition.x;
        p.y = result.transition.y;
        p.moving = false;
        p.running = false;
        this.resetCatchupBudget(client.sessionId);
      }
      if (this.world.day !== beforeDay) {
        this.clockMinute = 360;
        this.clockDay = this.world.day;
        this.clockStarted = now;
        this.state.minute = 360;
        for (const member of this.state.players.values()) member.stamina = 100;
      }
      this.state.storage = "ready";
      this.sync();
      for (const peer of this.clients) this.privateState(peer);
      client.send("actionResult", result);
    } catch (error) {
      client.send("actionResult", {
        actionId,
        ok: false,
        message:
          error instanceof Error ? error.message : "저장 실패. 다시 시도하세요",
        revision: this.world.revision,
      });
    }
  }
  private sync(): void {
    this.state.day = this.world.day;
    this.state.minute = this.world.minute;
    this.state.weather = this.world.weather;
    this.state.revision = this.world.revision;
    this.state.deepest = this.world.deepest;
    this.state.votes = this.votes.size;
    const entities = this.world.entities;
    for (const id of this.state.entities.keys())
      if (!entities[id]) this.state.entities.delete(id);
    for (const [id, data] of Object.entries(entities)) {
      const current = this.state.entities.get(id);
      if (current) Object.assign(current, data);
      else this.state.entities.set(id, new WorldEntity(data));
    }
  }
  private privateState(client: Client): void {
    const id = this.identities.get(client.sessionId)?.playerId;
    if (id)
      client.send("personal", {
        member: this.world.members[id],
        chest: this.world.chest,
        farmId: this.farmId,
        events: this.world.events,
      });
  }
  private async checkpoint(): Promise<void> {
    if (!this.lease || !this.world) return;
    try {
      const proposed = this.proposal();
      proposed.revision++;
      await this.lease.save(proposed, this.world.revision);
      this.world = proposed;
      this.state.revision = proposed.revision;
      this.state.storage = "ready";
    } catch {
      this.state.storage = "error";
    }
  }
  override onReconnect(client: Client): void {
    if (!this.identities.has(client.sessionId)) {
      client.leave(4000, "Session replaced");
      return;
    }
    super.onReconnect(client);
    this.privateState(client);
  }
  async onLeave(client: Client): Promise<void> {
    await this.enqueue(async () => {
      await this.checkpoint();
      const id = this.identities.get(client.sessionId)?.playerId;
      if (id) {
        this.activeMembers.delete(id);
        this.votes.delete(id);
        this.cooldown.delete(id);
      }
      this.identities.delete(client.sessionId);
      this.removePlayer(client);
      this.state.votes = this.votes.size;
    });
  }
  async onDispose(): Promise<void> {
    this.closing = true;
    clearInterval(this.timer);
    clearInterval(this.checkpointTimer);
    await this.queue;
    await this.checkpoint();
    if (this.lease) await this.lease.close();
    this.disposeMovement();
  }
}
