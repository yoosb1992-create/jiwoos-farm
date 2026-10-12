import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { matchMaker } from "@colyseus/core";
import type { FarmRoom } from "../server/FarmRoom.js";
import type { World } from "../shared/world.js";
import { chestInfo, chestInventory, type ChestInfo } from "../shared/chest-storage.js";
import { fixture, action, delay, join, until } from "./helpers.js";

test("connected storage commits merge/settings once, syncs the family, conserves contested withdrawals and reloads the snapshot", async () => {
  const f = await fixture();
  try {
    const room = matchMaker.getLocalRoomById(f.A.roomId) as FarmRoom;
    const world = () => (room as unknown as { world: World }).world;
    const first = world().entities.family_chest!;
    world().entities.linked = { ...first, id: "linked", x: first.x + 32 };
    chestInventory(world(), first.id).wood = 3;
    chestInventory(world(), "linked").wood = 4;
    for (const peer of [f.A, f.B, f.C]) Object.assign(room.state.players.get(peer.sessionId)!, { area: first.area, x: first.x + 16, y: first.y + 40 });
    let infos: Record<string, ChestInfo> | undefined;
    f.C.onMessage("personal", p => { infos = p.chestInfos; });
    assert.equal((await action(f.A, "configureChest", { targetId: first.id, chestName: "나무창고", chestColor: "blue" })).ok, true);
    await delay(230);
    const merge = { actionId: randomUUID(), targetId: first.id };
    const result = await action(f.A, "linkChest", merge);
    assert.equal(result.ok, true, result.message);
    assert.equal((await action(f.A, "linkChest", merge)).revision, result.revision);
    assert.equal(chestInventory(world(), "linked").wood, 7);
    await until(() => infos?.linked?.name === "나무창고" && infos.linked.size === 2);
    await until(() => f.C.state.entities.get("linked")?.chestColor === "blue");
    assert.equal(infos!.linked!.capacity, 32);
    await delay(230);
    const takes = await Promise.all([f.A, f.B].map((peer, i) => action(peer, "withdrawChest", { targetId: i ? "linked" : first.id, itemId: "wood", quantityMode: "all" })));
    assert.equal(takes.filter(r => r.ok).length, 1);
    assert.equal((world().members[f.a.playerId]!.inventory.wood ?? 0) + (world().members[f.b.playerId]!.inventory.wood ?? 0), 7);
    const expected = chestInfo(world(), first.id);
    await room.disconnect();
    const restored = await join(f.url, f.a);
    try {
      let personal: { chestInfos: Record<string, ChestInfo>; chestStores: Record<string, Record<string, number>> } | undefined;
      restored.onMessage("personal", p => { personal = p; }); restored.send("personal");
      await until(() => !!personal);
      assert.deepEqual(personal!.chestInfos[first.id], expected);
      assert.deepEqual(personal!.chestStores[expected.storageKey], {});
      // The durable action receipt still prevents replay after room recreation.
      assert.equal((await action(restored, "linkChest", merge)).revision, result.revision);
      assert.equal(personal!.chestInfos.linked!.storageKey, expected.storageKey);
    } finally { await restored.leave(); }
  } finally { await f.close(); }
});
