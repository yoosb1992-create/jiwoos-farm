import { insideWarp } from "../shared/regions.js";
import {
  collidesWithObstacle,
  isFarmable,
} from "../shared/applyMovement.js";
import type { WorldLayout } from "../shared/layout.js";
import test from "node:test";
import assert from "node:assert/strict";
import { matchMaker } from "@colyseus/core";
import { Client, CloseCode } from "@colyseus/sdk";
import { randomUUID } from "node:crypto";
import {
  fixture,
  until,
  delay,
  move,
  action,
  join,
  makeStore,
} from "./helpers.js";
import { FarmState, type Player } from "../shared/schema.js";
import { newWorld, newMember, addDrop, type World } from "../shared/world.js";
import { PostgresStore } from "../persistence/store.js";
import { MemoryTestStore } from "../persistence/memory-test-store.js";
import { createFarmServer } from "../server/createFarmServer.js";
import type { FarmRoom } from "../server/FarmRoom.js";
// Server-side fixture access never exists as a client message, URL or build flag.
const roomServer = (id: string) => matchMaker.getLocalRoomById(id) as FarmRoom;
const place = (
  room: FarmRoom,
  id: string,
  x: number,
  y: number,
  area = "farm",
  facing = "down",
) => {
  const p = room.state.players.get(id)!;
  Object.assign(p, { x, y, area, facing, running: false });
};
const clearFarmSpot = (room: FarmRoom) => {
  const layout = JSON.parse(room.state.layout) as WorldLayout,
    map = layout.maps.farm!,
    occupied = new Set(
      [...room.state.entities.values()]
        .filter((e) => e.area === "farm")
        .map((e) => `${Math.floor(e.x / 32)},${Math.floor(e.y / 32)}`),
    );
  for (let y = 2; y < map.height - 1; y++)
    for (let x = 1; x < map.width - 1; x++) {
      const target = `${x},${y}`,
        stand = `${x},${y - 1}`;
      if (
        isFarmable("farm", x, y, layout.maps) &&
        !occupied.has(target) &&
        !occupied.has(stand) &&
        !collidesWithObstacle(
          (x + 0.5) * 32,
          (y - 0.5) * 32,
          "farm",
          layout.maps,
          room.state.entities.values(),
        )
      )
        return {
          actorX: (x + 0.5) * 32,
          actorY: (y - 0.5) * 32,
          soilId: `soil-farm-${x}-${y}`,
        };
    }
  throw new Error("No clear farmable tile remains in the dense opening");
};

test("three real WebSocket/SDK clients share one family authority; input-only movement and convergence", async () => {
  const f = await fixture();
  try {
    assert.equal(f.A.roomId, f.B.roomId);
    assert.equal(f.B.roomId, f.C.roomId);
    await until(() => f.C.state.players.size === 3);
    const x = f.A.state.players.get(f.A.sessionId)!.x;
    await Promise.all([move(f.A, 1, 0), move(f.B, 0, 1)]);
    await until(() => f.B.state.players.get(f.A.sessionId)!.x > x);
    assert.equal(
      f.A.state.players.get(f.A.sessionId)!.x,
      f.C.state.players.get(f.A.sessionId)!.x,
    );
    f.A.send("position", { x: 999999, y: 999999 });
    f.A.send("inventory", { wood: 99999 });
    f.A.send("state", { entities: { hack: true } });
    await delay(100);
    assert.ok(f.A.state.players.get(f.A.sessionId)!.x < JSON.parse(f.A.state.layout).maps.farm.width * 32);
    assert.equal(f.A.state.entities.has("hack"), false);
    // Walk into the real portal with inputs only; no enterArea command.
    const room = roomServer(f.A.roomId),
      layout = JSON.parse(
        room.state.layout,
      ) as import("../shared/layout.js").WorldLayout;
    const warp = layout.maps.farm!.warps.find((w) => w.targetMapId === "road")!;
    const xPortal = (warp.area.startX + 0.5) * 32,
      yPortal = (warp.area.startY + 0.5) * 32;
    place(room, f.A.sessionId, xPortal, yPortal);
    await move(f.A, 0, 1, 2);
    await until(() => f.B.state.players.get(f.A.sessionId)!.area === "road");
    const arrived = f.B.state.players.get(f.A.sessionId)!;
    assert.equal(
      insideWarp(layout.maps.road!, arrived.x, arrived.y),
      undefined,
    );
    await delay(1600);
    assert.equal(f.C.state.players.get(f.A.sessionId)!.area, "road");
  } finally {
    await f.close();
  }
});
test("concurrent real clients: tree felling, drop pickup, chest withdrawal and duplicate action receipt", async () => {
  const f = await fixture();
  try {
    const room = roomServer(f.A.roomId);
    const tree = room.state.entities.get("starter-pine")!;
    for (const r of [f.A, f.B, f.C])
      place(room, r.sessionId, tree.x, tree.y - 32);
    const hits = await Promise.all(
      [f.A, f.B, f.C].map((r) => action(r, "hitTree", { targetId: tree.id })),
    );
    assert.ok(hits.every((r) => r.ok));
    await until(() => f.C.state.entities.get(tree.id)?.kind === "stump");
    assert.equal(
      [...f.C.state.entities.values()].filter(
        (e) => e.kind === "drop" && e.item === "wood",
      ).length,
      1,
    );
    await delay(230);
    const drop = [...f.C.state.entities.values()].find(
      (e) => e.kind === "drop" && e.item === "wood",
    )!;
    const picks = await Promise.all([
      action(f.A, "pickupDrop", { targetId: drop.id }),
      action(f.B, "pickupDrop", { targetId: drop.id }),
    ]);
    assert.equal(picks.filter((r) => r.ok).length, 1);
    const winner = picks[0]!.ok ? f.A : f.B;
    const chest = room.state.entities.get("family-chest")!;
    for (const r of [f.A, f.B, f.C]) place(room, r.sessionId, chest.x, chest.y);
    await delay(230);
    assert.equal(
      (
        await action(winner, "depositChest", {
          targetId: chest.id,
          itemId: "wood",
        })
      ).ok,
      true,
    );
    await delay(230);
    const withdrawals = await Promise.all([
      action(f.A, "withdrawChest", { targetId: chest.id, itemId: "wood" }),
      action(f.B, "withdrawChest", { targetId: chest.id, itemId: "wood" }),
    ]);
    assert.equal(withdrawals.filter((r) => r.ok).length, 1);
    const table = room.state.entities.get("crafting-table")!;
    place(room, f.C.sessionId, table.x, table.y);
    await delay(230);
    assert.equal(
      (
        await action(f.C, "craftItem", {
          targetId: table.id,
          itemId: "wood_plank",
        })
      ).ok,
      false,
    );
    // Duplicate successful till command must return the committed receipt and spend stamina once.
    place(room, f.C.sessionId, 36.5 * 32, 58.5 * 32);
    await delay(230);
    const id = randomUUID();
    const [one, two] = await Promise.all([
      action(f.C, "tillTile", { actionId: id }),
      action(f.C, "tillTile", { actionId: id }),
    ]);
    assert.ok(one.ok && two.ok);
    assert.equal(one.revision, two.revision);
    assert.equal(room.state.players.get(f.C.sessionId)!.stamina, 95); // one tree hit3 + till2
  } finally {
    await f.close();
  }
});
test("three-client mining contention and crafting idempotency validate inventory, range and stamina", async () => {
  const f = await fixture();
  try {
    const room = roomServer(f.A.roomId);
    // This is server-only test setup: no production command can grant inventory or teleport.
    const world = (room as unknown as { world: World }).world;
    world.members[f.a.playerId]!.inventory.wood = 2;
    const table = room.state.entities.get("crafting-table")!;
    place(room, f.A.sessionId, table.x, table.y);
    const id = randomUUID();
    const result = await Promise.all([
      action(f.A, "craftItem", {
        actionId: id,
        targetId: table.id,
        itemId: "wood_plank",
      }),
      action(f.A, "craftItem", {
        actionId: id,
        targetId: table.id,
        itemId: "wood_plank",
      }),
    ]);
    assert.ok(result.every((x) => x.ok));
    assert.equal(result[0]!.revision, result[1]!.revision);
    const inventory = () =>
      (room as unknown as { world: World }).world.members[f.a.playerId]!
        .inventory;
    assert.equal(inventory().wood ?? 0, 0);
    assert.equal(inventory().wood_plank, 1);
    const rock = [...room.state.entities.values()].find(
      (e) => e.area === "mine1" && e.kind === "rock",
    )!;
    for (const r of [f.A, f.B, f.C])
      place(room, r.sessionId, rock.x, rock.y - 32, "mine1");
    await delay(230);
    const hits = await Promise.all(
      [f.A, f.B, f.C].map((r) => action(r, "hitRock", { targetId: rock.id })),
    );
    assert.equal(hits.filter((x) => x.ok).length, 2);
    await until(() => !f.C.state.entities.has(rock.id));
    assert.equal(
      [...f.C.state.entities.values()].filter(
        (e) => e.kind === "drop" && e.area === "mine1",
      ).length,
      1,
    );
    await delay(230);
    assert.ok(
      (await action(f.A, "mineAction", { targetId: "ladder-mine1" })).ok,
    );
    await until(() => f.C.state.deepest === 2);
    const tree = room.state.entities.get("starter-pine")!;
    place(room, f.B.sessionId, tree.x, tree.y - 32);
    room.state.players.get(f.B.sessionId)!.stamina = 0;
    await delay(230);
    assert.equal(
      (await action(f.B, "hitTree", { targetId: tree.id })).ok,
      false,
    );
    place(room, f.C.sessionId, 900, 700);
    assert.equal(
      (await action(f.C, "hitTree", { targetId: tree.id })).ok,
      false,
    );
    f.A.send("inventory", { wood_plank: 999999 });
    f.B.send("tree", { targetId: tree.id, hp: 0 });
    await delay(100);
    assert.equal(inventory().wood_plank, 1);
    assert.equal(tree.hp, 3);
  } finally {
    await f.close();
  }
});
test("farming shares plant/water, all-online sleep advances crop and forest, contested harvest succeeds once", async () => {
  const f = await fixture();
  try {
    const room = roomServer(f.A.roomId),
      spot = clearFarmSpot(room);
    for (const r of [f.A, f.B, f.C])
      place(room, r.sessionId, spot.actorX, spot.actorY);
    assert.equal((await action(f.A, "tillTile")).ok, true);
    await delay(230);
    assert.equal(
      (await action(f.A, "plantSeed", { itemId: "sproutberry_seed" })).ok,
      true,
    );
    await until(() => f.B.state.entities.get(spot.soilId)?.kind === "crop");
    for (let day = 0; day < 3; day++) {
      await delay(230);
      if (!room.state.entities.get(spot.soilId)!.watered)
        assert.equal((await action(f.A, "waterCrop")).ok, true);
      await delay(230);
      const results = await Promise.all(
        [f.A, f.B, f.C].map((r) => action(r, "sleepVote", { value: true })),
      );
      assert.ok(results.every((r) => r.ok));
      await until(() => f.B.state.day === day + 2);
    }
    assert.ok(f.C.state.entities.has("forest-1-0")); // surviving trees keep their growth history
    assert.ok(f.C.state.entities.has("forest-4-12")); // daily forage still refreshes
    await delay(230);
    const harvests = await Promise.all([
      action(f.A, "harvestCrop"),
      action(f.B, "harvestCrop"),
    ]);
    assert.equal(harvests.filter((r) => r.ok).length, 1);
    await until(
      () =>
        [...f.C.state.entities.values()].filter((e) => e.item === "sproutberry")
          .length === 1,
    );
  } finally {
    await f.close();
  }
});
test("reconnect preserves identity/world and explicit disconnect cleans peers", async () => {
  const f = await fixture();
  try {
    const id = f.A.sessionId,
      token = f.A.reconnectionToken;
    f.A.connection.close(CloseCode.MAY_TRY_RECONNECT, "integration");
    await until(() => !f.B.state.players.get(id)?.connected);
    const restored = await new Client(f.url).reconnect<FarmState>(
      token,
      FarmState,
    );
    restored.reconnection.enabled = false;
    restored.onMessage("personal", () => undefined);
    await until(() => restored.state.players.get(id)?.connected === true);
    assert.equal(restored.sessionId, id);
    assert.equal(restored.state.day, f.B.state.day);
    await move(restored, 1, 0, 3);
    await restored.leave();
    await until(() => !f.C.state.players.has(id));
  } finally {
    await f.close();
  }
});
test("single-family lease fences duplicate authorities and durable state survives new server instance", async () => {
  const store = makeStore();
  await store.migrate();
  const a = await store.login(true, "", "restart");
  const server = createFarmServer({ store, port: 0, host: "127.0.0.1" });
  const { url } = await server.listen();
  const A = await join(url, a);
  const r = roomServer(A.roomId),
    spot = clearFarmSpot(r);
  place(r, A.sessionId, spot.actorX, spot.actorY);
  assert.ok((await action(A, "tillTile")).ok);
  await assert.rejects(() => store.lease(a.farmId, () => undefined));
  await A.leave();
  await server.close();
  const nextStore = process.env.DATABASE_URL
    ? new PostgresStore(process.env.DATABASE_URL)
    : store;
  const next = createFarmServer({
    store: nextStore,
    port: 0,
    host: "127.0.0.1",
  });
  const second = await next.listen();
  const restored = await join(second.url, a);
  try {
    assert.equal(restored.state.entities.get(spot.soilId)?.kind, "soil");
    assert.equal(restored.state.players.get(restored.sessionId)!.stamina, 98);
  } finally {
    await restored.leave();
    await next.close();
  }
});
