import { strict as assert } from "node:assert";
import { normalizeSaveData, type FarmTileData } from "../domain";
import { initialPlayerStats } from "../player/stats";
import { initialWateringCan, normalizeWateringCan, refillWateringCan, waterCrop } from "../tools/wateringCan";
import { FamilyError, FamilyRooms } from "../../server/family/rooms";
import { FamilyState } from "../../server/family/state";
import { FamilyPresenceService } from "../../server/family/presence";
import { familyTestDB } from "./family-db";
import { calendarDate } from "../world/calendar";
import { weatherFor } from "../weather/system";

const crop = (): FarmTileData => ({ x: 9, y: 8, tilled: true, wateredToday: false, cropType: "sproutberry", cropStage: 0, plantedDay: 1 });
const stats = initialPlayerStats(), can = initialWateringCan(), first = crop();
assert.deepEqual(can, { currentWater: 30, capacity: 30 });
assert.equal(waterCrop(first, stats, can), null);
assert.deepEqual([can.currentWater, stats.stamina, stats.skills.farming.experience], [29, 97, 2], "successful watering consumes exactly one water and one action cost");
const afterSuccess = { can: structuredClone(can), stats: structuredClone(stats) };
assert.match(waterCrop(first, stats, can)!, /이미/);
assert.deepEqual({ can, stats }, afterSuccess, "already-watered crops consume neither water nor stamina");

for (const [tile, playerStats, wateringCan, message] of [
  [{ ...crop(), cropType: null, cropStage: null }, initialPlayerStats(), initialWateringCan(), /씨앗/],
  [crop(), { ...initialPlayerStats(), stamina: 2 }, initialWateringCan(), /체력/],
  [crop(), initialPlayerStats(), { currentWater: 0, capacity: 30 }, /비었어요/],
] as const) {
  const before = { tile: structuredClone(tile), stats: structuredClone(playerStats), can: structuredClone(wateringCan) };
  assert.match(waterCrop(tile, playerStats, wateringCan)!, message);
  assert.deepEqual({ tile, stats: playerStats, can: wateringCan }, before, "failed watering is atomic");
}

const refillStats = initialPlayerStats(), refillCan = { currentWater: 0, capacity: 30 };
assert.equal(refillWateringCan(refillCan), true);
assert.deepEqual(refillCan, { currentWater: 30, capacity: 30 });
assert.deepEqual(refillStats, initialPlayerStats(), "refilling consumes no stamina or XP");
assert.equal(refillWateringCan(refillCan), false, "a full can is not changed");
assert.deepEqual(normalizeWateringCan({ currentWater: 0, capacity: 30 }), { currentWater: 0, capacity: 30 }, "saved zero must not be treated as missing");
assert.deepEqual(normalizeWateringCan(undefined), initialWateringCan(), "legacy saves receive a full can");

const legacyBase = { day: 1, timeMinutes: 360, money: 500, selectedTool: "water", player: { mapId: "farm", x: 304, y: 272, facing: "down" }, inventory: { items: {} }, farm: [], savedAt: 1 };
for (const version of [1, 2, 3, 4]) assert.deepEqual(normalizeSaveData({ ...legacyBase, version })?.wateringCan, initialWateringCan(), `v${version} save defaults to 30/30`);
const emptySave = normalizeSaveData({ ...legacyBase, version: 4, wateringCan: { currentWater: 0, capacity: 30 } })!;
assert.equal(normalizeSaveData(JSON.parse(JSON.stringify(emptySave)))?.wateringCan?.currentWater, 0, "zero water survives JSON save/reload");

const { db, close } = familyTestDB();
try {
  const now = 100_000;
  const rooms = new FamilyRooms(db, () => now), state = new FamilyState(db, () => now), presence = new FamilyPresenceService(db, () => now);
  const a = await rooms.create("water-A", "물뿌리개 가족", "A"), b = await rooms.join("water-B", a.room.inviteCode, "B"), roomId = a.room.id;
  await state.read("water-A", roomId);
  const dryDay = Array.from({ length: 40 }, (_, i) => i + 1).find(day => weatherFor(roomId, day).id !== "rain")!;
  const row = await db.prepare("SELECT world_json FROM family_state WHERE room_id=?").bind(roomId).first<{ world_json: string }>();
  const world = JSON.parse(row!.world_json);
  world.daySerial = dryDay; world.day = calendarDate(dryDay).day;
  for (const x of [9, 10, 11]) Object.assign(world.farm.find((tile: FarmTileData) => tile.x === x && tile.y === 8), crop(), { x });
  await db.prepare("UPDATE family_state SET world_json=? WHERE room_id=?").bind(JSON.stringify(world), roomId).run();

  const pose = (x = 304) => ({ mapId: "farm", x, y: 272, facing: "down" as const, selectedTool: "water" as const, moving: false });
  const act = async (user: string, action: object) => state.act(user, roomId, (await state.read(user, roomId)).revision, action);
  const firstWater = await act("water-A", { kind: "tool", tool: "water", x: 9, y: 8, pose: pose() });
  assert.deepEqual([firstWater.wateringCan?.currentWater, firstWater.stats?.stamina, firstWater.stats?.skills.farming.experience], [29, 97, 2]);
  assert.equal((await state.read("water-B", roomId)).wateringCan?.currentWater, 30, "family members have separate water state");

  const invalidRefill = { ...pose(), facing: "up" as const };
  await presence.heartbeat("water-A", roomId, invalidRefill, crypto.randomUUID());
  const beforeInvalid = await state.read("water-A", roomId);
  await assert.rejects(state.act("water-A", roomId, beforeInvalid.revision, { kind: "water-refill", pose: invalidRefill }), (error: unknown) => error instanceof FamilyError && error.status === 400);
  assert.deepEqual([(await state.read("water-A", roomId)).wateringCan, (await state.read("water-A", roomId)).stats], [beforeInvalid.wateringCan, beforeInvalid.stats], "server rejects remote/non-water refill without partial state");

  // Feet are in row 14, so facing down selects the authored pond water at (25, 15).
  const waterPose = { mapId: "farm", x: 25.5 * 32, y: 451, facing: "down" as const, selectedTool: "water" as const, moving: false };
  await presence.heartbeat("water-A", roomId, waterPose, crypto.randomUUID());
  const beforeRefill = await state.read("water-A", roomId);
  const refilled = await state.act("water-A", roomId, beforeRefill.revision, { kind: "water-refill", pose: waterPose });
  assert.equal(refilled.wateringCan?.currentWater, 30);
  assert.deepEqual(refilled.stats, beforeRefill.stats, "server refill consumes no stamina or XP");

  const sharedRevision = refilled.revision, secondPose = pose(336);
  const repeated = await Promise.allSettled([
    state.act("water-A", roomId, sharedRevision, { kind: "tool", tool: "water", x: 10, y: 8, pose: secondPose }),
    state.act("water-A", roomId, sharedRevision, { kind: "tool", tool: "water", x: 10, y: 8, pose: secondPose }),
  ]);
  assert.equal(repeated.filter(result => result.status === "fulfilled").length, 1, "CAS accepts a retried water action once");
  assert.equal(repeated.filter(result => result.status === "rejected" && result.reason instanceof FamilyError && result.reason.status === 409).length, 1);
  const afterRetry = await state.read("water-A", roomId);
  assert.deepEqual([afterRetry.wateringCan?.currentWater, afterRetry.stats?.stamina, afterRetry.stats?.skills.farming.experience], [29, 94, 4], "retry does not double-consume water/stamina or duplicate XP");
  assert.equal((await state.read("water-B", roomId)).wateringCan?.currentWater, 30);
  const inventoryRow = await db.prepare("SELECT inventories_json FROM family_state WHERE room_id=?").bind(roomId).first<{ inventories_json: string }>();
  const inventories = JSON.parse(inventoryRow!.inventories_json);
  inventories[a.room.playerId].wateringCan.currentWater = 0;
  await db.prepare("UPDATE family_state SET inventories_json=? WHERE room_id=?").bind(JSON.stringify(inventories), roomId).run();
  const empty = await state.read("water-A", roomId);
  await assert.rejects(state.act("water-A", roomId, empty.revision, { kind: "tool", tool: "water", x: 11, y: 8, pose: pose(368) }), (error: unknown) => error instanceof FamilyError && error.status === 409 && /비었어요/.test(error.message));
  const emptyDenied = await state.read("water-A", roomId);
  assert.deepEqual([emptyDenied.revision, emptyDenied.wateringCan, emptyDenied.stats, emptyDenied.world], [empty.revision, empty.wateringCan, empty.stats, empty.world], "empty server can rejects watering atomically");
  await presence.heartbeat("water-A", roomId, waterPose, crypto.randomUUID());
  const fullAgain = await state.act("water-A", roomId, emptyDenied.revision, { kind: "water-refill", pose: waterPose });
  assert.equal(fullAgain.wateringCan?.currentWater, 30);
  assert.notEqual(a.room.playerId, b.room.playerId);
} finally { close(); }

console.log("Watering can: success-only consumption, refill, save compatibility, Family authority and CAS passed");
