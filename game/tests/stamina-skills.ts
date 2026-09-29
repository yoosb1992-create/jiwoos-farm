import { strict as assert } from "node:assert";
import { normalizeSaveData } from "../domain";
import { canPerformAction, initialPlayerStats, normalizePlayerStats, recordSuccessfulAction, restoreStamina } from "../player/stats";
import { experienceForLevel, SKILL_ACTIONS } from "../skills/definitions";
import { awardExperience, nextLevelExperience } from "../skills/progression";
import { FamilyError, FamilyRooms } from "../../server/family/rooms";
import { FamilyState } from "../../server/family/state";
import { FamilyPresenceService } from "../../server/family/presence";
import { familyTestDB } from "./family-db";
import { generateResourceForest, resourceKind } from "../forest/resources";
import { calendarDate } from "../world/calendar";
import { weatherFor } from "../weather/system";

const stats = initialPlayerStats();
assert.deepEqual([stats.stamina, stats.maxStamina], [100, 100]);
assert.deepEqual(Object.values(stats.skills).map(s => [s.level, s.experience]), [[1, 0], [1, 0], [1, 0]]);
assert.deepEqual([SKILL_ACTIONS.hoe.stamina, SKILL_ACTIONS.water.stamina, SKILL_ACTIONS.axe.stamina, SKILL_ACTIONS.pickaxe.stamina], [4, 3, 6, 7]);
for (const [action, stamina, skill, xp] of [
  ["hoe", 96, "farming", 3], ["water", 93, "farming", 5], ["harvest", 93, "farming", 11],
  ["axe", 87, "foraging", 3], ["forage", 87, "foraging", 5], ["pickaxe", 80, "mining", 4],
] as const) {
  recordSuccessfulAction(stats, action);
  assert.equal(stats.stamina, stamina);
  assert.equal(stats.skills[skill].experience, xp);
}
assert.equal(nextLevelExperience(1), experienceForLevel(2));
assert.equal(awardExperience(stats.skills, "farming", 500), true);
assert.equal(stats.skills.farming.level, 5, "one reward crosses multiple level thresholds");
stats.stamina = 2;
const before = structuredClone(stats);
assert.equal(canPerformAction(stats, "hoe"), false);
assert.equal(recordSuccessfulAction(stats, "hoe"), false);
assert.deepEqual(stats, before, "failed action cannot change stamina or XP");
restoreStamina(stats); assert.equal(stats.stamina, stats.maxStamina);
assert.deepEqual(normalizePlayerStats({ stamina: -99, maxStamina: 100, skills: { farming: { level: 20, experience: 0 } } }).skills.farming,
  { level: 1, experience: 0 }, "saved levels derive from XP");

const save = { day: 5, daySerial: 117, timeMinutes: 500, money: 77, selectedTool: "axe", player: { mapId: "farm", x: 304, y: 272, facing: "down" },
  inventory: { items: { sproutberry_seed: 5, wood: 2 } }, toolProgression: { axe: 2, pickaxe: 1 }, stats,
  farm: [{ x: 9, y: 8, tilled: true, wateredToday: true, cropType: "sproutberry", cropStage: 1, plantedDay: 5 }], savedAt: 99 };
const restored = normalizeSaveData({ ...save, version: 4 })!;
assert.deepEqual(restored.stats, stats);
assert.deepEqual(normalizeSaveData(JSON.parse(JSON.stringify(restored)))?.stats, stats);
assert.deepEqual(restored.inventory.items, save.inventory.items);
assert.deepEqual(restored.toolProgression, save.toolProgression);
assert.equal(restored.daySerial, 117);
for (const version of [1, 2, 3, 4]) {
  const legacy = version < 3 ? { ...save, inventory: { seeds: 5, harvest: 2 } } : save;
  const normalized = normalizeSaveData({ ...legacy, version, stats: undefined });
  assert.deepEqual(normalized?.stats, initialPlayerStats(), `v${version} defaults to full stamina and Lv1`);
  assert.equal(normalized?.money, save.money);
  if (version >= 3) assert.equal(normalized?.inventory.items.wood, 2);
}

const { db, close } = familyTestDB();
try {
  let now = 100_000;
  const rooms = new FamilyRooms(db, () => now), state = new FamilyState(db, () => now), presence = new FamilyPresenceService(db, () => now);
  const a = await rooms.create("stamina-A", "개인 성장", "A"), b = await rooms.join("stamina-B", a.room.inviteCode, "B");
  const id = a.room.id;
  const dryDay = Array.from({ length: 40 }, (_, i) => i + 1).find(day => weatherFor(id, day).id !== "rain")!;
  await state.read("stamina-A", id);
  await db.prepare("UPDATE family_state SET world_json=json_set(world_json, '$.daySerial', ?, '$.day', ?) WHERE room_id=?")
    .bind(dryDay, calendarDate(dryDay).day, id).run();
  const pose = { mapId: "farm", x: 304, y: 272, facing: "down", moving: false, selectedTool: "hoe" };
  const bed = { ...pose, mapId: "farmhouse", x: 304, y: 224 };
  await presence.heartbeat("stamina-A", id, pose, crypto.randomUUID());
  await presence.heartbeat("stamina-B", id, pose, crypto.randomUUID());
  const act = async (user: string, action: object) => state.act(user, id, (await state.read(user, id)).revision, action);
  const tool = (name: string, x = 9, y = 8) => ({ kind: "tool", tool: name, x, y, pose });
  const first = await act("stamina-A", tool("hoe"));
  assert.deepEqual([first.stats?.stamina, first.stats?.skills.farming.experience], [96, 3]);
  assert.deepEqual([(await state.read("stamina-B", id)).stats?.stamina, (await state.read("stamina-B", id)).stats?.skills.farming.experience], [100, 0]);
  const afterHoe = first.revision;
  await assert.rejects(act("stamina-A", tool("hoe")), (e: unknown) => e instanceof FamilyError && e.status === 409);
  assert.equal((await state.read("stamina-A", id)).revision, afterHoe, "repeated invalid action has no revision or XP");
  const planted = await act("stamina-A", tool("seed"));
  assert.equal(planted.inventory.items.sproutberry_seed, 7);
  assert.equal(planted.stats?.stamina, 96);
  const plantedRow = await db.prepare("SELECT inventories_json FROM family_state WHERE room_id=?").bind(id).first<{ inventories_json: string }>();
  const beforeWater = JSON.parse(plantedRow!.inventories_json);
  beforeWater[a.room.playerId].stats.stamina = 2;
  await db.prepare("UPDATE family_state SET inventories_json=? WHERE room_id=?").bind(JSON.stringify(beforeWater), id).run();
  const waterDenied = await state.read("stamina-A", id);
  await assert.rejects(act("stamina-A", tool("water")), (e: unknown) => e instanceof FamilyError && e.status === 409 && /체력/.test(e.message));
  const waterUnchanged = await state.read("stamina-A", id);
  assert.equal(waterUnchanged.revision, waterDenied.revision);
  assert.deepEqual(waterUnchanged.world, waterDenied.world);
  assert.deepEqual(waterUnchanged.inventory, waterDenied.inventory);
  assert.deepEqual(waterUnchanged.stats, waterDenied.stats);
  beforeWater[a.room.playerId].stats.stamina = 96;
  await db.prepare("UPDATE family_state SET inventories_json=? WHERE room_id=?").bind(JSON.stringify(beforeWater), id).run();
  const watered = await act("stamina-A", tool("water"));
  assert.deepEqual([watered.stats?.stamina, watered.stats?.skills.farming.experience], [93, 5]);
  await assert.rejects(act("stamina-A", tool("water")), (e: unknown) => e instanceof FamilyError && e.status === 409);
  const row = await db.prepare("SELECT inventories_json FROM family_state WHERE room_id=?").bind(id).first<{ inventories_json: string }>();
  const privateData = JSON.parse(row!.inventories_json);
  privateData[a.room.playerId].stats.stamina = 2;
  await db.prepare("UPDATE family_state SET inventories_json=? WHERE room_id=?").bind(JSON.stringify(privateData), id).run();
  const beforeFailure = await state.read("stamina-A", id);
  await assert.rejects(act("stamina-A", tool("hoe", 10)), (e: unknown) => e instanceof FamilyError && e.status === 409 && /체력/.test(e.message));
  const denied = await state.read("stamina-A", id);
  assert.equal(denied.revision, beforeFailure.revision);
  assert.deepEqual(denied.world, beforeFailure.world);
  assert.deepEqual(denied.inventory, beforeFailure.inventory);
  assert.deepEqual(denied.stats, beforeFailure.stats);
  const nodes = generateResourceForest(id, dryDay).objects;
  const tree = nodes.find(n => resourceKind(n) === "tree")!, ore = nodes.find(n => resourceKind(n) === "ore")!;
  const forest = (node: typeof tree, selectedTool: "axe" | "pickaxe") => ({ kind: "forest-gather", nodeId: node.id, daySerial: dryDay, tool: selectedTool,
    pose: { ...pose, mapId: "fairy_forest", x: node.position.tileX * 32 - 35, y: node.position.tileY * 32, selectedTool } });
  await assert.rejects(act("stamina-A", forest(tree, "axe")), (e: unknown) => e instanceof FamilyError && e.status === 409 && /체력/.test(e.message));
  assert.equal((await state.read("stamina-A", id)).world.forestState?.hits[tree.id], undefined);
  privateData[a.room.playerId].stats.stamina = 100;
  privateData[a.room.playerId].toolProgression = { axe: 1, pickaxe: 1 };
  await db.prepare("UPDATE family_state SET inventories_json=? WHERE room_id=?").bind(JSON.stringify(privateData), id).run();
  const hit = await act("stamina-A", forest(tree, "axe"));
  assert.deepEqual([hit.stats?.stamina, hit.stats?.skills.foraging.experience, hit.world.forestState?.hits[tree.id]], [94, 3, 1]);
  const oreRow = await db.prepare("SELECT inventories_json FROM family_state WHERE room_id=?").bind(id).first<{ inventories_json: string }>();
  const beforeOre = JSON.parse(oreRow!.inventories_json);
  beforeOre[a.room.playerId].stats.stamina = 6;
  await db.prepare("UPDATE family_state SET inventories_json=? WHERE room_id=?").bind(JSON.stringify(beforeOre), id).run();
  const oreDenied = await state.read("stamina-A", id);
  await assert.rejects(act("stamina-A", forest(ore, "pickaxe")), (e: unknown) => e instanceof FamilyError && e.status === 409 && /체력/.test(e.message));
  const oreUnchanged = await state.read("stamina-A", id);
  assert.equal(oreUnchanged.revision, oreDenied.revision);
  assert.equal(oreUnchanged.world.forestState?.hits[ore.id], undefined);
  assert.deepEqual(oreUnchanged.stats, oreDenied.stats);
  beforeOre[a.room.playerId].stats.stamina = 94;
  await db.prepare("UPDATE family_state SET inventories_json=? WHERE room_id=?").bind(JSON.stringify(beforeOre), id).run();
  const mined = await act("stamina-A", forest(ore, "pickaxe"));
  assert.deepEqual([mined.stats?.stamina, mined.stats?.skills.mining.experience, mined.world.forestState?.hits[ore.id]], [87, 4, 1]);
  const otherTree = nodes.find(n => resourceKind(n) === "tree" && n.id !== tree.id)!;
  const otherHit = await act("stamina-B", forest(otherTree, "axe"));
  assert.equal(otherHit.stats?.stamina, 94);
  assert.equal((await state.read("stamina-A", id)).stats?.stamina, 87, "other player cannot spend A's stamina");
  assert.equal(weatherFor(id, otherHit.world.daySerial!).id, weatherFor(id, (await state.read("stamina-A", id)).world.daySerial!).id);
  await act("stamina-A", { kind: "sleep", pose: bed });
  const next = await act("stamina-B", { kind: "sleep", pose: bed });
  assert.equal(next.world.daySerial, dryDay + 1);
  assert.equal(next.stats?.stamina, 100);
  assert.equal((await state.read("stamina-A", id)).stats?.stamina, 100);
  assert.equal((await state.read("stamina-A", id)).stats?.skills.mining.experience, 4);
  assert.equal(next.world.day, (await state.read("stamina-A", id)).world.day);
  now += 100;
} finally { close(); }
console.log("Stamina and skills: costs, success-only XP, levels, saves, server authority and private Family recovery passed");
