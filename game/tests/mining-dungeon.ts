import { strict as assert } from "node:assert";
import { FamilyError, FamilyRooms } from "../../server/family/rooms";
import { FamilyState } from "../../server/family/state";
import { FamilyPresenceService } from "../../server/family/presence";
import { Inventory, normalizeSaveData } from "../domain";
import { MINE_ENTRY, MINE_PLAYABLE_FLOORS, generateMineFloor, mineFloorFromMapId, mineFloorSeed, mineMapId, recoverMinePosition } from "../mine/generation";
import { emptyMineDaily, findMineResource, initialMineProgress, MINE_RESOURCES, mineResourceKind, normalizeMineDaily, strikeMineNode } from "../mine/resources";
import { installMine } from "../mine/registry";
import { MapRegistry } from "../maps/MapRegistry";
import { MAP_DEFINITIONS, TILE_TYPE_DEFINITIONS, getTileTypeInMap } from "../maps/definitions";
import { safeForestPosition } from "../forest/generation";
import { installFairyForest } from "../forest/registry";
import { canPerformAction, initialPlayerStats, recordSuccessfulAction, restoreStamina } from "../player/stats";
import { parseFamilyPose } from "../family/personal";
import { visibleFamilyPlayers } from "../family/presence";
import { familyTestDB } from "./family-db";

const scope = "mine-test";
const gate = (floor: number, day = 1) => generateMineFloor(scope, day, floor).objects.find(o => mineResourceKind(o) === "stair")!;
assert.equal(mineFloorFromMapId(mineMapId(5)), 5);
assert.equal(mineFloorFromMapId("mine_floor_6"), null);
assert.equal(mineFloorFromMapId("mine_floor_01"), null);
assert.equal(mineFloorSeed(scope, 1, 1), mineFloorSeed(scope, 1, 1));
assert.notEqual(mineFloorSeed(scope, 1, 1), mineFloorSeed(scope, 1, 2));
assert.notEqual(mineFloorSeed(scope, 1, 1), mineFloorSeed(scope, 2, 1));
const first = generateMineFloor(scope, 1, 1);
assert.deepEqual(first, generateMineFloor(scope, 1, 1));
assert.notDeepEqual(first.objects, generateMineFloor(scope, 2, 1).objects);
assert.notDeepEqual(first.objects, generateMineFloor(scope, 1, 2).objects);
assert.deepEqual(first.spawns[0], { id: "entry", ...MINE_ENTRY });
assert.deepEqual(recoverMinePosition(first, { x: 0, y: 0 }), { x: MINE_ENTRY.tileX * 32, y: MINE_ENTRY.tileY * 32 });
for (const floor of [1, 2, 3, 4, 5]) {
  const map = generateMineFloor(scope, 1, floor);
  for (const spawn of map.spawns) assert.ok(safeForestPosition(map, spawn.tileX * 32, spawn.tileY * 32));
  assert.ok(safeForestPosition(map, 11.5 * 32, 15.5 * 32));
  assert.ok(safeForestPosition(map, 11.5 * 32, 3.5 * 32));
  assert.equal(TILE_TYPE_DEFINITIONS[getTileTypeInMap(map, 11, 8)].walkable, true, "central corridor remains open");
  assert.equal(map.warps.length, floor === MINE_PLAYABLE_FLOORS ? 1 : 2);
  assert.equal(map.warps[0].targetMapId, floor === 1 ? "road" : mineMapId(floor - 1));
  assert.equal(map.warps.some(warp => warp.targetMapId === mineMapId(6)), false, "terminal floor cannot reference a missing map");
  assert.ok(map.objects.some(o => mineResourceKind(o) === "stone"));
  assert.ok(map.objects.some(o => mineResourceKind(o) === "copper"));
}
const registry = new MapRegistry();
installFairyForest(registry, scope, 1);
assert.ok(installMine(registry, scope, 1));
assert.deepEqual(MAP_DEFINITIONS.road.warps.map(w => w.id), ["to_farm", "to_town"], "authored maps remain untouched");
assert.ok(registry.require("road").warps.some(w => w.id === "to_mine"));
assert.ok(registry.require("road").warps.some(w => w.id === "to_fairy_forest"));
assert.ok(registry.require("fairy_forest"));
assert.equal(registry.require("road").spawns.find(s => s.id === "mine_return")?.tileX, 8.5);
assert.equal(registry.require("road").spawns.find(s => s.id === "mine_return")?.tileY, 10.5);
assert.ok(safeForestPosition(registry.require("road"), 8.5 * 32, 10.5 * 32));
assert.ok(safeForestPosition(registry.require("road"), 6.5 * 32, 10.5 * 32));
assert.equal(findMineResource(first, { x: gate(1).position.tileX * 32, y: gate(1).position.tileY * 32 }, { x: 0, y: 0 }), undefined);
let daily = emptyMineDaily(1), progress = initialMineProgress();
const stats = initialPlayerStats(), tools = { axe: 1, pickaxe: 1 }, locked = { ...tools, pickaxe: 0 };
assert.equal(strikeMineNode(daily, progress, 1, gate(1), locked), null, "locked pickaxe cannot strike");
for (let floor = 1; floor <= MINE_PLAYABLE_FLOORS; floor++) {
  const stone = generateMineFloor(scope, 1, floor).objects.find(o => mineResourceKind(o) === "stone")!;
  const copper = generateMineFloor(scope, 1, floor).objects.find(o => mineResourceKind(o) === "copper")!;
  const before = structuredClone(daily);
  assert.equal(strikeMineNode(daily, progress, floor, { ...stone, id: "fake-node" }, tools), null);
  assert.deepEqual(daily, before);
  for (const node of [stone, copper, gate(floor)]) {
    const kind = mineResourceKind(node)!;
    for (let hit = 1; hit <= MINE_RESOURCES[kind].hits; hit++) {
      assert.ok(canPerformAction(stats, "pickaxe"));
      const result = strikeMineNode(daily, progress, floor, node, tools)!;
      daily = result.daily; progress = result.progress;
      recordSuccessfulAction(stats, "pickaxe");
      assert.equal(Boolean(result.drop), hit === MINE_RESOURCES[kind].hits);
    }
    assert.equal(strikeMineNode(daily, progress, floor, node, tools), null, "drop cannot be repeated");
  }
  assert.equal(progress.deepestUnlockedFloor, Math.min(5, floor + 1));
  restoreStamina(stats);
}
assert.equal(stats.skills.mining.experience > 0, true);
assert.equal(progress.deepestUnlockedFloor, 5);
assert.equal(normalizeMineDaily(daily, 2, scope).floors[1], undefined, "daily hits/depletion reset");
assert.deepEqual(progress, { deepestUnlockedFloor: 5 }, "permanent progress survives reset");
const inventory = new Inventory({ items: { stone: 4, copper_ore: 2, wood: 3 } });
const singleNode = generateMineFloor("single", 1, 1).objects.find(o => mineResourceKind(o) === "stone")!;
const singleHit = strikeMineNode(emptyMineDaily(1), initialMineProgress(), 1, singleNode, tools)!.daily;
const singleDaily = strikeMineNode(singleHit, initialMineProgress(), 1, singleNode, tools)!.daily;
const saved = normalizeSaveData({ version: 4, day: 1, daySerial: 1, player: { mapId: mineMapId(3), x: 368, y: 464, facing: "up" },
  inventory: inventory.serialize(), stats, toolProgression: tools, mineDaily: singleDaily, mineProgress: progress,
  forestState: { daySerial: 1, hits: {}, depleted: [] }, buildings: { instances: [] }, farmProgress: { unlocked: [] }, storage: { containers: {} }, farm: [] })!;
assert.deepEqual(saved.mineDaily, singleDaily); assert.deepEqual(saved.mineProgress, progress);
assert.equal(saved.player.mapId, mineMapId(3)); assert.equal(saved.inventory.items.copper_ore, 2);
assert.deepEqual(normalizeSaveData(JSON.parse(JSON.stringify(saved)))?.stats, stats);
for (const version of [1, 2, 3, 4]) {
  const legacy = normalizeSaveData({ ...saved, version, mineProgress: undefined, mineDaily: undefined })!;
  assert.deepEqual(legacy.mineProgress, initialMineProgress());
  assert.deepEqual(legacy.mineDaily, emptyMineDaily(1));
}
installMine(registry, scope, 1, daily);
assert.ok(!registry.require(mineMapId(1)).objects.some(o => o.id === gate(1).id));
installMine(registry, scope, 2, daily);
assert.ok(registry.require(mineMapId(1)).objects.some(o => o.id === gate(1).id));
assert.ok(parseFamilyPose({ mapId: mineMapId(3), x: 368, y: 464, facing: "up", selectedTool: "pickaxe", moving: false }));
assert.equal(parseFamilyPose({ mapId: "mine_floor_100", x: 368, y: 464, facing: "up", selectedTool: "pickaxe", moving: false }), null);

const { db, close } = familyTestDB();
try {
  const now = () => 100000, rooms = new FamilyRooms(db, now), service = new FamilyState(db, now), presence = new FamilyPresenceService(db, now);
  const a = await rooms.create("mine-A", "광산 가족", "A"), b = await rooms.join("mine-B", a.room.inviteCode, "B");
  const roomId = a.room.id;
  assert.deepEqual(generateMineFloor(roomId, 1, 1), generateMineFloor(roomId, 1, 1), "both clients derive identical floor layout");
  const remote = { playerId: b.room.playerId, nickname: "B", x: 320, y: 320, facing: "up" as const, selectedTool: "pickaxe" as const, moving: false, lastSeen: 100000 };
  assert.equal(visibleFamilyPlayers({ players: [{ ...remote, mapId: mineMapId(1) }], serverNow: 100000 }, a.room.playerId, mineMapId(3)).length, 0);
  assert.equal(visibleFamilyPlayers({ players: [{ ...remote, mapId: mineMapId(1) }], serverNow: 100000 }, a.room.playerId, mineMapId(1)).length, 1);
  await service.read("mine-A", roomId);
  await db.prepare("UPDATE family_state SET inventories_json=? WHERE room_id=?")
    .bind(JSON.stringify({ [a.room.playerId]: { items: {}, toolProgression: tools }, [b.room.playerId]: { items: {}, toolProgression: tools } }), roomId).run();
  const node = generateMineFloor(roomId, 1, 1).objects.find(o => mineResourceKind(o) === "copper")!;
  const at = (target: typeof node, floor = 1) => ({ mapId: mineMapId(floor), x: target.position.tileX * 32 - 35, y: target.position.tileY * 32, facing: "right", moving: false, selectedTool: "pickaxe" });
  const hit = (target: typeof node, floor = 1) => ({ kind: "mine-hit", floor, nodeId: target.id, daySerial: 1, tool: "pickaxe", pose: at(target, floor) });
  const heartbeat = async (user: string, target: typeof node, floor = 1) => presence.heartbeat(user, roomId, at(target, floor), user === "mine-A" ? "00000000-0000-4000-8000-000000000001" : "00000000-0000-4000-8000-000000000002");
  const latest = (user = "mine-A") => service.read(user, roomId);
  const act = async (user: string, request: object) => service.act(user, roomId, (await latest(user)).revision, request);
  const assertFailure = async (request: object, status: number) => {
    const before = await latest();
    await assert.rejects(service.act("mine-A", roomId, before.revision, request), (e: unknown) => e instanceof FamilyError && e.status === status);
    const after = await latest();
    assert.equal(after.revision, before.revision);
    assert.deepEqual([after.world.mineDaily, after.world.mineProgress, after.inventory, after.stats],
      [before.world.mineDaily, before.world.mineProgress, before.inventory, before.stats]);
  };
  assert.equal((await latest()).world.mineProgress?.deepestUnlockedFloor, 1);
  // 2.3 movement is independent from D1 presence: action.pose is authoritative
  // for distance/map validation, while heartbeat remains online/sleep metadata only.
  await heartbeat("mine-A", node); await heartbeat("mine-B", node);
  await assertFailure(hit(node, 2), 400);
  await assertFailure({ ...hit(node), daySerial: 2 }, 400);
  await assertFailure({ ...hit(node), nodeId: "copper-999-999" }, 400);
  await assertFailure({ ...hit(node), pose: { ...at(node), x: 0, y: 0 } }, 400);
  await assertFailure({ ...hit(node), pose: { ...at(node), mapId: "road" } }, 400);
  await assertFailure({ ...hit(node), tool: "axe" }, 400);
  await db.prepare("UPDATE family_state SET inventories_json=json_set(inventories_json, ?, 0) WHERE room_id=?")
    .bind(`$.\"${a.room.playerId}\".toolProgression.pickaxe`, roomId).run();
  await assertFailure(hit(node), 400);
  await db.prepare("UPDATE family_state SET inventories_json=json_set(inventories_json, ?, 1) WHERE room_id=?")
    .bind(`$.\"${a.room.playerId}\".toolProgression.pickaxe`, roomId).run();
  const lowStats = { ...initialPlayerStats(), stamina: 0 };
  await db.prepare("UPDATE family_state SET inventories_json=json_set(inventories_json, ?, json(?)) WHERE room_id=?")
    .bind(`$.\"${a.room.playerId}\".stats`, JSON.stringify(lowStats), roomId).run();
  await assertFailure(hit(node), 409);
  await db.prepare("UPDATE family_state SET inventories_json=json_set(inventories_json, ?, json(?)) WHERE room_id=?")
    .bind(`$.\"${a.room.playerId}\".stats`, JSON.stringify(initialPlayerStats()), roomId).run();
  const firstHit = await act("mine-A", hit(node));
  assert.equal(firstHit.world.mineDaily?.floors[1]?.hits[node.id], 1);
  assert.equal(firstHit.stats?.stamina, 100 - 7);
  assert.equal((await latest("mine-B")).stats?.stamina, 100);
  assert.equal(firstHit.stats?.skills.mining.experience > 0, true);
  assert.equal((await latest("mine-B")).stats?.skills.mining.experience, 0);
  const secondHit = await act("mine-B", hit(node));
  assert.equal(secondHit.world.mineDaily?.floors[1]?.hits[node.id], 2);
  const race = await Promise.allSettled([
    service.act("mine-A", roomId, secondHit.revision, hit(node)),
    service.act("mine-B", roomId, secondHit.revision, hit(node)),
  ]);
  assert.equal(race.filter(r => r.status === "fulfilled").length, 1);
  assert.ok(race.find(r => r.status === "rejected")?.reason instanceof FamilyError);
  const stateA = await latest(), stateB = await latest("mine-B");
  assert.deepEqual(stateA.world.mineDaily, stateB.world.mineDaily);
  assert.equal((stateA.inventory.items.copper_ore ?? 0) + (stateB.inventory.items.copper_ore ?? 0), 2);
  assert.equal(stateA.world.mineDaily?.floors[1]?.depleted.filter(id => id === node.id).length, 1);
  await assertFailure(hit(node), 409);
  const rock = generateMineFloor(roomId, 1, 1).objects.find(o => mineResourceKind(o) === "stone")!;
  await heartbeat("mine-B", rock);
  await act("mine-B", hit(rock)); await act("mine-B", hit(rock));
  assert.equal((await latest("mine-B")).inventory.items.stone, 2);
  assert.equal((await latest()).inventory.items.stone ?? 0, 0);
  for (let floor = 1; floor < MINE_PLAYABLE_FLOORS; floor++) {
    const stair = generateMineFloor(roomId, 1, floor).objects.find(o => mineResourceKind(o) === "stair")!;
    await heartbeat("mine-A", stair, floor);
    await act("mine-A", hit(stair, floor));
    const unlocked = await act("mine-A", hit(stair, floor));
    assert.equal(unlocked.world.mineProgress?.deepestUnlockedFloor, floor + 1);
    assert.equal((await latest("mine-B")).world.mineProgress?.deepestUnlockedFloor, floor + 1);
  }
  const sleeper = { kind: "sleep", pose: { mapId: "farmhouse", x: 304, y: 224, facing: "down", moving: false, selectedTool: "hand" } };
  await act("mine-B", sleeper);
  const tomorrow = await act("mine-A", sleeper);
  assert.equal(tomorrow.world.daySerial, 2);
  assert.deepEqual(tomorrow.world.mineDaily, emptyMineDaily(2));
  assert.equal(tomorrow.world.mineProgress?.deepestUnlockedFloor, 5);
  assert.equal(tomorrow.stats?.stamina, tomorrow.stats?.maxStamina);
  assert.equal((await latest("mine-B")).stats?.stamina, 100);
  assert.equal(tomorrow.world.forestState?.daySerial, 2);
  assert.ok(tomorrow.world.farm.length > 0);
  await assertFailure(hit(node), 400);
  console.log("Mining dungeon: deterministic floors, exits, resources, progression, save migration, Family authority and CAS passed");
} finally { close(); }
