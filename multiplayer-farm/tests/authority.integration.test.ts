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
    assert.ok(f.A.state.players.get(f.A.sessionId)!.x < 1664);
    assert.equal(f.A.state.entities.has("hack"), false);
  } finally {
    await f.close();
  }
});
test("concurrent real clients: tree felling, drop pickup, chest withdrawal and duplicate crafting receipt", async () => {
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
    place(room, f.C.sessionId, 304, 272);
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
test("farming shares plant/water, all-online sleep advances crop and forest, contested harvest succeeds once", async () => {
  const f = await fixture();
  try {
    const room = roomServer(f.A.roomId);
    for (const r of [f.A, f.B, f.C]) place(room, r.sessionId, 304, 272);
    assert.equal((await action(f.A, "tillTile")).ok, true);
    await delay(230);
    assert.equal(
      (await action(f.A, "plantSeed", { itemId: "sproutberry_seed" })).ok,
      true,
    );
    await until(() => f.B.state.entities.get("soil-farm-9-9")?.kind === "crop");
    for (let day = 0; day < 3; day++) {
      await delay(230);
      if (!room.state.entities.get("soil-farm-9-9")!.watered)
        assert.equal((await action(f.A, "waterCrop")).ok, true);
      await delay(230);
      const results = await Promise.all(
        [f.A, f.B, f.C].map((r) => action(r, "sleepVote", { value: true })),
      );
      assert.ok(results.every((r) => r.ok));
      await until(() => f.B.state.day === day + 2);
    }
    assert.ok(f.C.state.entities.has("forest-4-0"));
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
  const a = await store.login(true, "", "비밀", "restart");
  const server = createFarmServer({ store, port: 0, host: "127.0.0.1" });
  const { url } = await server.listen();
  const A = await join(url, a);
  const r = roomServer(A.roomId);
  place(r, A.sessionId, 304, 272);
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
    assert.equal(restored.state.entities.get("soil-farm-9-9")?.kind, "soil");
    assert.equal(restored.state.players.get(restored.sessionId)!.stamina, 98);
  } finally {
    await restored.leave();
    await next.close();
  }
});
