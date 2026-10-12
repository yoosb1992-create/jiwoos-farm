import { carryAppearance } from "../shared/transport.js";
import { TRANSPORT_DURATION_MS } from "../shared/transport-config.js";
import { inRect } from "../shared/world2.js";
import { chestInfo, chestInfos, chestStorageKeys } from "../shared/chest-storage.js";
import { calendar } from "../shared/expansion.js";
import { Encoder } from "@colyseus/schema";
// Initial immutable layout is sent once. Subsequent 30 Hz patches remain deltas.
Encoder.BUFFER_SIZE = 4 * 1024 * 1024;
import { ServerError, type Client, type StepContext } from "@colyseus/core";
import { MovementRoom } from "./MovementRoom.js";
import { WorldEntity, type Player } from "../shared/schema.js";
import { applyAction, parseCommand } from "../shared/actions.js";
import {
  newMember,
  upgradeWorld,
  ACTION_COOLDOWN_MS,
  CHECKPOINT_MS,
  WORLD_VERSION,
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
import {
  insideWarp,
  safeSpawn,
  TRANSITION_COOLDOWN_MS,
} from "../shared/regions.js";
import { collidesWithObstacle } from "../shared/applyMovement.js";
import { TILE, mapFor } from "../shared/content.js";
import { DropIndex, PICKUP_SCAN_MS, DROP_SETTLE_MS, dropAppearDelay, pickupRadius } from "../shared/interaction.js";

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
  private readonly transitionUntil = new Map<string, number>();
  private readonly transitionPending = new Set<string>();
  private votes = new Set<string>();
  private timer?: ReturnType<typeof setInterval>;
  private checkpointTimer?: ReturnType<typeof setInterval>;
  private closing = false;
  private clockStarted = Date.now();
  private clockMinute = 360;
  private clockDay = 1;
  private dueCheckpoint = false;
  private readonly drops = new DropIndex();
  private readonly pickupPending = new Set<string>();
  private readonly dropReady = new Map<string, number>();
  private readonly pickupCooldown = new Map<string, number>();
  private lastPickupScan = 0;
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
    const migrateGroups = this.world.chestGroupsVersion !== 1 || this.world.version < WORLD_VERSION;
    upgradeWorld(this.world);
    if (migrateGroups) {
      // Commit the one-time routing/ledger transition before any client can
      // observe the group. The lease keeps the old snapshot intact on failure.
      const revision = this.world.revision++;
      await this.lease.save(this.world, revision);
    }
    this.movementMaps = this.world.layout!.maps;
    this.state.layout = JSON.stringify(this.world.layout);
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
            proposed.day,
          );
          proposed.revision++;
          await this.lease.save(proposed, this.world.revision);
          this.world = proposed;
        }
        this.addPlayer(client, { nickname: auth.nickname });
        const p = this.state.players.get(client.sessionId)!;
        p.playerId = auth.playerId;
        const spawn = safeSpawn("farm", "farm_entry", this.movementMaps!, true, this.state.entities.values());
        p.x = spawn.x;
        p.y = spawn.y;
        p.facing = spawn.facing;

        const member = this.world.members[auth.playerId]!;
        const carriedPosition = member.carried?.position;
        if (carriedPosition && this.movementMaps![carriedPosition.area] &&
            !collidesWithObstacle(carriedPosition.x, carriedPosition.y, carriedPosition.area, this.movementMaps, this.state.entities.values())) {
          p.area = carriedPosition.area; p.x = carriedPosition.x; p.y = carriedPosition.y; p.facing = carriedPosition.facing;
        }
        p.stamina = member.stamina;
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
    const w = {
      ...structuredClone({ ...this.world, layout: undefined }),
      layout: this.world.layout,
    };
    w.minute = this.state.minute;
    for (const p of this.state.players.values()) {
      const m = w.members[p.playerId];
      if (m) {
        m.stamina = p.stamina;
        if (m.carried) m.carried.position = { area: p.area, x: p.x, y: p.y, facing: p.facing };
      }
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
  private async command(client: Client, value: unknown, automaticPickup = false): Promise<void> {
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
      // A retransmitted transition must receive its committed receipt before cooldown validation.
      if (
        command.type === "enterArea" &&
        Date.now() < (this.transitionUntil.get(client.sessionId) ?? 0)
      )
        throw new Error("지역 이동 준비 중입니다");
      const now = Date.now();
      const picking = command.type === "pickupDrop";
      const cooldown = picking ? this.pickupCooldown : this.cooldown;
      if (
        now - (cooldown.get(identity.playerId) ?? 0) <
        (picking ? PICKUP_SCAN_MS : ACTION_COOLDOWN_MS)
      )
        throw new Error("행동 준비 중입니다");
      if (picking && now < (this.dropReady.get(command.targetId ?? "") ?? 0))
        throw new Error("아이템이 내려오는 중이에요");
      cooldown.set(identity.playerId, now);
      const proposed = this.proposal(),
        votes = new Set(this.votes);
      const beforeDay = proposed.day;
      const actor = this.actor(p);
      const result = applyAction(proposed, actor, command, {
        now,
        online: [...this.state.players.values()]
          .filter((x) => x.connected)
          .map((x) => x.playerId),
        votes, players: [...this.state.players.values()].filter(other => other.connected),
      });
      if (result.fx) result.fx.actorId = client.sessionId;
      if (result.transportFx) result.transportFx.actorId = client.sessionId;
      // Reserve actor while a durable action is committing. Movement packets cannot alter action range during storage.
      const freeze = command.type !== "plantSeed" && !picking;
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
      if (freeze) p.actionTicks = result.transportFx ? Math.ceil(TRANSPORT_DURATION_MS / (1000 / 30)) : result.fx?.tool === "scythe" ? 10 : 12;
      if (result.transportFx) this.broadcast("transportFx", result.transportFx);
      if (result.transition) {
        this.transitionUntil.set(
          client.sessionId,
          Date.now() + TRANSITION_COOLDOWN_MS,
        );
        p.area = result.transition.area;
        p.x = result.transition.x;
        p.y = result.transition.y;
        if (result.transition.facing) p.facing = result.transition.facing;
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
      if (result.fx) {
        for (const drop of result.fx.drops)
          this.dropReady.set(drop.id, Date.now() + dropAppearDelay(result.fx) + DROP_SETTLE_MS);
        // Broadcast after the durable inventory/entity transaction commits.
        // Duplicate action IDs return their receipt above and never replay FX.
        this.broadcast("actionFx", result.fx);
      }
      this.sync();
      for (const peer of this.clients) this.privateState(peer);
      if (!automaticPickup) client.send("actionResult", result);
    } catch (error) {
      if (!automaticPickup) client.send("actionResult", {
        actionId,
        ok: false,
        message:
          error instanceof Error ? error.message : "저장 실패. 다시 시도하세요",
        revision: this.world.revision,
      });
    }
  }
  protected override afterMovement(_context: StepContext): void {
    // Re-arm a short lock once per server tick, even if input catch-up consumed
    // extra frames. No per-frame animation coordinates cross the network.
    for (const p of this.state.players.values()) if ((this.world.members[p.playerId]?.transportUntil ?? 0) > Date.now()) p.actionTicks = Math.max(3, p.actionTicks);
    if (this.closing || this.pending >= 32) return;
    const now = Date.now();
    if (now - this.lastPickupScan >= PICKUP_SCAN_MS) {
      this.lastPickupScan = now;
      for (const [sid,p] of this.state.players) {
        if (!p.connected || this.pending >= 24 || now-(this.pickupCooldown.get(p.playerId)??0)<PICKUP_SCAN_MS) continue;
        const inventory = this.world.members[p.playerId]?.inventory;
        const client = this.clients.get(sid);
        if (!inventory || !client) continue;
        const e = this.drops.nearby(p.area,p.x,p.y,pickupRadius()).find(e =>
          !this.pickupPending.has(e.id) && now >= (this.dropReady.get(e.id)??0) &&
          (inventory[e.item] || Object.keys(inventory).length < 48) && (inventory[e.item]??0)+e.quantity<=999999);
        if (!e) continue;
        this.pickupPending.add(e.id); this.pending++;
        void this.enqueue(() => this.command(client,{
          actionId: crypto.randomUUID(), type:"pickupDrop", targetId:e.id,
        },true)).finally(()=>{ this.pickupPending.delete(e.id);this.pending--; });
      }
    }
    for (const [sid, p] of this.state.players) {
      if (
        !p.connected ||
        this.transitionPending.has(sid) ||
        now < (this.transitionUntil.get(sid) ?? 0)
      )
        continue;
      const warp = insideWarp(mapFor(p.area, this.movementMaps), p.x, p.y),
        client = this.clients.get(sid);
      if (!client) continue;
      const ev = mapFor(p.area, this.movementMaps).world2?.events.find(
        (e) =>
          e.trigger !== "interact" &&
          inRect(e.area, Math.floor(p.x / 32), Math.floor(p.y / 32)) &&
          !this.world.members[p.playerId]?.quests[
            `event-${p.area}-${e.id}-${e.once ? "once" : this.world.day}`
          ] &&
          (e.trigger === "enter" ||
            (e.trigger === "date" && e.condition === String(this.world.day)) ||
            (e.trigger === "time" &&
              this.world.minute >= Number(e.condition)) ||
            (e.trigger === "weather" && this.world.weather === e.condition) ||
            (e.trigger === "season" &&
              calendar(this.world.day).season === e.condition) ||
            (e.trigger === "quest" &&
              !!this.world.members[p.playerId]?.quests[e.condition])),
      );
      if (!warp && !ev) continue;
      const fromArea = p.area;
      this.transitionPending.add(sid);
      this.pending++;
      void this.enqueue(async () => {
        if (
          p.area !== fromArea ||
          (warp &&
            insideWarp(mapFor(p.area, this.movementMaps), p.x, p.y)?.id !==
              warp.id)
        )
          return;
        await this.command(client, {
          actionId: crypto.randomUUID(),
          type: warp ? "enterArea" : "worldEvent",
          targetId: warp?.id ?? ev!.id,
        });
      }).finally(() => {
        this.transitionPending.delete(sid);
        this.pending--;
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
    for (const p of this.state.players.values()) {
      const m = this.world.members[p.playerId];
      const appearance = m && carryAppearance(this.world, m);
      p.carrying = !!appearance;
      p.carry = appearance ? JSON.stringify(appearance) : "";
    }
    const entities = this.world.entities;
    this.drops.rebuild(Object.values(entities));
    for (const id of this.dropReady.keys()) if (!entities[id]) this.dropReady.delete(id);
    for (const id of this.state.entities.keys())
      if (!entities[id]) this.state.entities.delete(id);
    for (const [id, data] of Object.entries(entities)) {
      const info = data.kind === "chest" ? chestInfo(this.world, id) : undefined;
      const visible = info ? { ...data, chestName: info.name, chestColor: info.color, chestSize: info.size, chestIndex: info.index } : data;
      const current = this.state.entities.get(id);
      if (current) Object.assign(current, visible);
      else this.state.entities.set(id, new WorldEntity(visible));
    }
  }
  private privateState(client: Client): void {
    const id = this.identities.get(client.sessionId)?.playerId;
    if (id)
      client.send("personal", {
        member: this.world.members[id],
        chestStores: this.world.chestStores ?? {},
        chestStorageKeys: chestStorageKeys(this.world),
        chestInfos: chestInfos(this.world),
        legacyChestTarget: this.world.legacyChestTarget,
        sleepVoted: this.votes.has(id),
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
        this.pickupCooldown.delete(id);
      }
      this.identities.delete(client.sessionId);
      this.transitionUntil.delete(client.sessionId);
      this.transitionPending.delete(client.sessionId);
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
