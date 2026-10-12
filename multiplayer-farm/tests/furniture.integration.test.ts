import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { matchMaker } from "@colyseus/core";
import type { FarmRoom } from "../server/FarmRoom.js";
import { entity, type World, type Member } from "../shared/world.js";
import { chestInventory, chestInfo } from "../shared/chest-storage.js";
import { mergeChestGroup } from "../shared/chest-groups.js";
import { fixture, action, delay, join, until } from "./helpers.js";

test("one family member owns a carried group; durable receipt/rejoin preserve its stock and lowering commits exactly once", async () => {
  const f = await fixture();
  let restored: Awaited<ReturnType<typeof join>> | undefined;
  try {
    let room = matchMaker.getLocalRoomById(f.A.roomId) as FarmRoom;
    const read = () => (room as unknown as { world: World }).world;
    const w = read(); w.entities = {};
    const farm = w.layout!.maps.farm!; farm.objects = []; farm.collisionRegions = []; delete farm.world2;
    for (let i = 0; i < 2; i++) w.entities[`carry-${i}`] = entity(`carry-${i}`, "farm", "chest", 656 + i * 32, 624, "storage_chest");
    chestInventory(w, "carry-0").wood = 7;
    assert.equal(mergeChestGroup(w, ["carry-0", "carry-1"]), undefined);
    const key = chestInfo(w, "carry-0").storageKey;
    w.chestSettings![key] = { name: "운반할 재료함", color: "purple" };
    for (const peer of [f.A, f.B, f.C]) {
      Object.assign(room.state.players.get(peer.sessionId)!, { area: "farm", x: 656, y: 656, facing: "up" });
      peer.onMessage("transportFx", () => {});
    }
    const liftIds = [randomUUID(), randomUUID()];
    const lifts = await Promise.all([f.A, f.B].map((peer, i) => action(peer, "liftChest", { targetId: "carry-0", actionId: liftIds[i] })));
    assert.equal(lifts.filter(r => r.ok).length, 1);
    const winner = lifts[0]!.ok ? 0 : 1, session = winner ? f.b : f.a, peer = winner ? f.B : f.A;
    const receipt = lifts[winner]!;
    await until(() => [...f.C.state.players.values()].some(p => p.playerId === session.playerId && p.carrying && p.carry.includes("purple")));
    assert.equal(read().entities["carry-0"], undefined);
    assert.equal((await action(peer, "liftChest", { targetId: "carry-0", actionId: liftIds[winner] })).revision, receipt.revision);
    assert.equal(Object.values(read().members).filter(m => m.carried).length, 1);
    const carried = structuredClone(read().members[session.playerId]!.carried);
    await room.disconnect();
    restored = await join(f.url, session); restored.onMessage("transportFx", () => {});
    room = matchMaker.getLocalRoomById(restored.roomId) as FarmRoom;
    let member: Member | undefined;
    restored.onMessage("personal", p => { member = p.member; }); restored.send("personal");
    await until(() => !!member?.carried);
    assert.deepEqual(member!.carried, carried);
    assert.equal(read().entities["carry-0"], undefined); assert.equal(chestInventory(read(), "carry-0").wood, 7);
    assert.equal((await action(restored, "liftChest", { targetId: "carry-0", actionId: liftIds[winner] })).revision, receipt.revision);
    await delay(1000);
    const lower = { actionId: randomUUID() };
    const result = await action(restored, "lowerChest", lower);
    assert.equal(result.ok, true, result.message);
    assert.equal((await action(restored, "lowerChest", lower)).revision, result.revision);
    assert.equal(read().members[session.playerId]!.carried, undefined);
    assert.equal(chestInfo(read(), "carry-1").storageKey, key);
    assert.equal(chestInfo(read(), "carry-1").name, "운반할 재료함");
    assert.equal(chestInventory(read(), "carry-1").wood, 7);
    assert.equal(Object.values(read().entities).filter(e => e.kind === "chest").length, 2);
  } finally { if (restored?.connection.isOpen) await restored.leave(); await f.close(); }
});
