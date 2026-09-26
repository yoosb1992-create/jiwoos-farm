import { strict as assert } from "node:assert";
import { FamilyError, FamilyRooms } from "../../server/family/rooms";
import { FamilyState } from "../../server/family/state";
import type { FamilyPose } from "../family/types";
import { familyPersonalKey } from "../family/personal";
import { familyTestDB } from "./family-db";
const { db, close } = familyTestDB();
try {
  let now = 1_000_000;
  const rooms = new FamilyRooms(db, () => now), state = new FamilyState(db, () => now);
  const a = await rooms.create("A", "공유 농장", "지우"); await rooms.join("B", a.room.inviteCode, "아빠");
  const other = await rooms.create("C", "다른 농장", "엄마");
  const pose: FamilyPose = { mapId: "farm", x: 304, y: 272, facing: "down", selectedTool: "hoe", moving: false };
  const roomId = a.room.id, initial = await state.read("A", roomId);
  assert.deepEqual(initial.world, (await state.read("B", roomId)).world);
  const hoe = { kind: "tool", tool: "hoe", x: 9, y: 8, pose };
  const results = await Promise.allSettled([state.act("A", roomId, 0, hoe), state.act("B", roomId, 0, hoe)]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1, "only one writer may win a revision");
  assert.equal((await state.read("B", roomId)).world.farm[0].tilled, true);
  const planted = await state.act("A", roomId, 1, { ...hoe, tool: "seed" });
  assert.equal(planted.inventory.items.sproutberry_seed, 7);
  assert.equal((await state.read("B", roomId)).inventory.items.sproutberry_seed, 8);
  await assert.rejects(state.act("A", roomId, 1, { ...hoe, tool: "seed" }), (e: unknown) => e instanceof FamilyError && e.status === 409);
  assert.equal((await state.read("A", roomId)).inventory.items.sproutberry_seed, 7, "retry must not consume twice");
  let revision = planted.revision;
  for (let day = 0; day < 3; day++) {
    const water = await state.act("B", roomId, revision, { ...hoe, tool: "water" });
    const sleep = await state.act("A", roomId, water.revision, { kind: "sleep", pose: { ...pose, mapId: "farmhouse", x: 304, y: 224 } });
    revision = sleep.revision;
  }
  const mature = await state.read("B", roomId); assert.equal(mature.world.farm[0].cropStage, 3); assert.equal(mature.world.day, 4);
  const harvest = await state.act("B", roomId, revision, { ...hoe, tool: "hand" });
  assert.equal(harvest.inventory.items.sproutberry, 1); assert.equal((await state.read("A", roomId)).inventory.items.sproutberry, 0);
  const sold = await state.act("B", roomId, harvest.revision, { kind: "sell", pose });
  assert.equal(sold.world.money, 155); assert.equal((await state.read("A", roomId)).world.money, 155);
  assert.equal((await state.read("C", other.room.id)).world.farm[0].tilled, false);
  await assert.rejects(state.read("C", roomId)); await assert.rejects(state.act("C", roomId, sold.revision, hoe));
  await assert.rejects(state.act("A", roomId, sold.revision, { ...hoe, pose: { ...pose, x: NaN } }));
  await assert.rejects(state.act("A", roomId, sold.revision, { kind: "replace", world: initial.world, pose }));
  now += 5000; const tick = await state.read("A", roomId); assert.equal(tick.world.timeMinutes, 370); assert.equal(tick.revision, sold.revision);
  assert.notEqual(familyPersonalKey(roomId, a.room.playerId), "jiwoos-farm.save.v4");
  console.log("Family state: A/B sync, atomic revision race, private inventory, growth/sale/time, room isolation passed");
} finally { close(); }
