import { strict as assert } from "node:assert";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BuildingPanel } from "../../app/components/BuildingPanel";
import { Inventory, advanceFarmDay, normalizeSaveData, type FarmTileData } from "../domain";
import { MAP_DEFINITIONS } from "../maps/definitions";
import { initialBuildings, buildingPlacementError, constructBuilding, normalizeBuildings } from "../buildings/system";
import { initialFarmProgress, expansionTiles, isFarmTile, unlockExpansion, FARM_EXPANSIONS } from "../farm/expansions";
import { initialPlaceables, placeObject, placementError } from "../placeables/system";
import { idleMachine } from "../machines/system";
import { waterFarmForRain, weatherFor } from "../weather/system";
import { WEATHER_DEFINITIONS } from "../weather/definitions";
import { initialPlayerStats } from "../player/stats";
import { initialStorage } from "../storage/container";
import { FamilyRooms, FamilyError } from "../../server/family/rooms";
import { FamilyState } from "../../server/family/state";
import { familyTestDB } from "./family-db";

const map = MAP_DEFINITIONS.farm, buildings = initialBuildings(), placeables = initialPlaceables(), progress = initialFarmProgress();
const bag = new Inventory({ items: { wood_plank: 5, stone_block: 2, wood_processor: 1, sproutberry_seed: 2 } });
const pose = { mapId: "farm", x: 13 * 32, y: 18 * 32 };
assert.deepEqual(buildings, initialBuildings());
assert.deepEqual(progress, { unlocked: [] });
assert.equal(isFarmTile(map, progress, 10, 18), false);
const farm: FarmTileData[] = [];
const invalid = (x: number, y: number, players = [pose]) => {
  const before = [structuredClone(buildings), bag.serialize()];
  const result = constructBuilding(buildings, placeables, farm, bag, 120, map, "work_shed", x, y, players, "bad", 1);
  assert.ok(result.error); assert.equal(result.money, 120); assert.deepEqual([buildings, bag.serialize()], before);
};
invalid(40, 24); invalid(24, 16); invalid(4, 4); invalid(4, 7); invalid(9, 8); invalid(9, 17);
invalid(14, 17, [{ mapId: "farm", x: 14 * 32, y: 17 * 32 }]);
const cropTile: FarmTileData = { x: 14, y: 17, tilled: true, wateredToday: false, cropType: "sproutberry", cropStage: 0, plantedDay: 1 };
farm.push(cropTile); invalid(14, 17); farm.pop();
const emptyMoney = constructBuilding(buildings, placeables, farm, bag, 99, map, "work_shed", 14, 17, [pose], "poor", 1);
assert.ok(emptyMoney.error); assert.equal(emptyMoney.money, 99); assert.equal(bag.count("wood_plank"), 5);
const poorMaterials = new Inventory({ items: { wood_plank: 1, stone_block: 1 } });
assert.ok(constructBuilding(buildings, placeables, farm, poorMaterials, 120, map, "work_shed", 14, 17, [pose], "poor", 1).error);
assert.equal(poorMaterials.count("wood_plank"), 1); assert.deepEqual(buildings, initialBuildings());
assert.equal(placeObject(placeables, bag, "wood_processor", map, 15, 18, [pose], "machine"), null);
invalid(14, 17);
placeables.instances.length = 0;
const result = constructBuilding(buildings, placeables, farm, bag, 120, map, "work_shed", 14, 17, [pose], "shed", 1);
assert.deepEqual(result, { error: null, money: 20 });
assert.deepEqual([bag.count("wood_plank"), bag.count("stone_block"), buildings.instances[0].status], [3, 1, "ready"]);
invalid(14, 17);
assert.match(placementError(placeables, "wood_processor", map, 15, 18, [pose], buildings)!, /건물/);
assert.ok(placeObject(placeables, bag, "wood_processor", map, 15, 18, [pose], "impossible", buildings));
assert.equal(bag.count("wood_processor"), 0, "the earlier successful machine placement consumed the one item");
const saved = normalizeSaveData({ version: 4, day: 1, timeMinutes: 360, money: 20, selectedTool: "hoe",
  player: { ...pose, facing: "down" }, inventory: bag.serialize(), farm, buildings, farmProgress: progress, placeables,
  storage: initialStorage(), stats: initialPlayerStats(), toolProgression: { axe: 2, pickaxe: 1 }, savedAt: 1 })!;
assert.deepEqual(saved.buildings, buildings); assert.deepEqual(saved.placeables, placeables);
assert.deepEqual(saved.toolProgression, { axe: 2, pickaxe: 1 }); assert.deepEqual(saved.storage, initialStorage());
assert.deepEqual(saved.stats, initialPlayerStats());
for (const version of [1, 2, 3, 4]) {
  const old = normalizeSaveData({ ...saved, version, buildings: undefined, farmProgress: undefined })!;
  assert.deepEqual(old.buildings, initialBuildings()); assert.deepEqual(old.farmProgress, initialFarmProgress());
}
assert.equal(normalizeBuildings({ instances: [{ ...buildings.instances[0], readyDaySerial: 2, status: "constructing" }] }, 1).instances[0].status, "constructing");
assert.equal(normalizeBuildings({ instances: [{ ...buildings.instances[0], readyDaySerial: 2, status: "constructing" }] }, 2).instances[0].status, "ready");
assert.equal(FARM_EXPANSIONS.south_plot.area.startX, 9);
assert.equal(unlockExpansion(progress, farm, bag, 59, "south_plot").error !== null, true);
assert.equal(progress.unlocked.length, 0);
placeables.instances.push({ id: "old-object", definitionId: "wood_processor", mapId: "farm", tileX: 10, tileY: 18, facing: "down", state: { machine: idleMachine() } });
assert.match(unlockExpansion(progress, farm, bag, 60, "south_plot", placeables, buildings).error!, /비워/);
assert.equal(bag.count("wood_plank"), 3); placeables.instances.length = 0;
const expanded = unlockExpansion(progress, farm, bag, 60, "south_plot", placeables, buildings);
assert.deepEqual(expanded, { error: null, money: 0 });
assert.deepEqual([progress.unlocked, farm.length, bag.count("wood_plank")], [["south_plot"], 12, 2]);
assert.ok(unlockExpansion(progress, farm, bag, 100, "south_plot").error);
assert.deepEqual([farm.length, bag.count("wood_plank")], [12, 2]);
assert.equal(isFarmTile(map, progress, 10, 18), true);
const expandedTile = farm.find(t => t.x === 10 && t.y === 18)!;
expandedTile.tilled = true;
expandedTile.cropType = "sproutberry"; expandedTile.cropStage = 0; bag.consume("sproutberry_seed");
waterFarmForRain(farm, WEATHER_DEFINITIONS.rain);
assert.equal(expandedTile.wateredToday, true);
advanceFarmDay(farm); assert.equal(expandedTile.cropStage, 1);
for (let i = 0; i < 2; i++) { expandedTile.wateredToday = true; advanceFarmDay(farm); }
assert.equal(expandedTile.cropStage, 3);
bag.add("sproutberry"); expandedTile.cropType = null; expandedTile.cropStage = null;
assert.equal(bag.count("sproutberry"), 1);
assert.deepEqual(normalizeSaveData({ ...saved, farmProgress: progress, farm, inventory: bag.serialize() })?.farmProgress, progress);
const markup = renderToStaticMarkup(createElement(BuildingPanel, { money: 120, items: bag.serialize().items, progress, count: 1,
  busy: false, notice: "준비", onBuild: () => {}, onExpand: () => {}, onClose: () => {} }));
assert.ok(markup.includes("건설 위치 선택") && markup.includes("남쪽 작은 밭") && markup.includes("해금") && markup.includes("보유"));

const { db, close } = familyTestDB();
try {
  let now = 100000;
  const rooms = new FamilyRooms(db, () => now), state = new FamilyState(db, () => now);
  const a = await rooms.create("shed-A", "창고", "A"), b = await rooms.join("shed-B", a.room.inviteCode, "B"), roomId = a.room.id;
  await state.read("shed-A", roomId);
  await db.prepare("UPDATE family_state SET world_json=json_set(world_json,'$.money',300), inventories_json=? WHERE room_id=?")
    .bind(JSON.stringify({ [a.room.playerId]: { items: { wood_plank: 4, stone_block: 2, sproutberry_seed: 2 }, stats: { ...initialPlayerStats(), stamina: 45 } },
      [b.room.playerId]: { items: { wood_plank: 4, stone_block: 2, sproutberry_seed: 2, wood_processor: 1, wood: 2 } } }), roomId).run();
  const farmPose = { ...pose, facing: "right", moving: false, selectedTool: "hoe" };
  const action = (kind: string, extra: object = {}, at = farmPose) => ({ kind, pose: at, ...extra });
  const act = async (user: string, value: object) => state.act(user, roomId, (await state.read(user, roomId)).revision, value);
  const revision = (await state.read("shed-A", roomId)).revision;
  const build = action("build", { definitionId: "work_shed", tileX: 14, tileY: 17 });
  const race = await Promise.allSettled([state.act("shed-A", roomId, revision, build), state.act("shed-B", roomId, revision, build)]);
  assert.equal(race.filter(r => r.status === "fulfilled").length, 1);
  assert.equal((race.find(r => r.status === "rejected") as PromiseRejectedResult).reason.status, 409);
  const first = await state.read("shed-A", roomId), other = await state.read("shed-B", roomId);
  assert.equal(first.world.buildings?.instances.length, 1); assert.deepEqual(first.world.buildings, other.world.buildings);
  assert.equal(first.world.money, 200); assert.equal(first.world.placeables?.instances.length, 0);
  assert.equal((first.inventory.items.wood_plank ?? 0) + (other.inventory.items.wood_plank ?? 0), 6);
  const preFailed = await state.read("shed-B", roomId);
  await assert.rejects(act("shed-B", action("place", { definitionId: "wood_processor", tileX: 15, tileY: 18 }, { ...farmPose, x: 13.5 * 32 })),
    (e: unknown) => e instanceof FamilyError && e.status === 409 && /건물/.test(e.message));
  assert.deepEqual(await state.read("shed-B", roomId), preFailed);
  const plotPose = { ...farmPose, x: 8.5 * 32, y: 18 * 32 };
  const expansion = action("farm-expand", { expansionId: "south_plot" }, plotPose);
  const same = (await state.read("shed-A", roomId)).revision;
  const expansionRace = await Promise.allSettled([state.act("shed-A", roomId, same, expansion), state.act("shed-B", roomId, same, expansion)]);
  assert.equal(expansionRace.filter(r => r.status === "fulfilled").length, 1);
  assert.equal((expansionRace.find(r => r.status === "rejected") as PromiseRejectedResult).reason.status, 409);
  const openedA = await state.read("shed-A", roomId), openedB = await state.read("shed-B", roomId);
  assert.deepEqual(openedA.world.farmProgress?.unlocked, ["south_plot"]);
  assert.deepEqual(openedA.world.farmProgress, openedB.world.farmProgress);
  assert.equal(openedA.world.money, 140);
  assert.equal(openedA.world.farm.filter(t => t.x >= 9 && t.x <= 12 && t.y >= 17 && t.y <= 19).length, 12);
  assert.equal((openedA.inventory.items.wood_plank ?? 0) + (openedB.inventory.items.wood_plank ?? 0), 5);
  await assert.rejects(act("shed-B", expansion), (e: unknown) => e instanceof FamilyError && e.status === 409);
  assert.equal((await state.read("shed-A", roomId)).world.money, 140);
  const fieldPose = { ...farmPose, x: 9.5 * 32, y: 18 * 32, selectedTool: "hoe" };
  await act("shed-B", action("tool", { tool: "hoe", x: 10, y: 18 }, fieldPose));
  await act("shed-B", action("tool", { tool: "seed", cropId: "sproutberry", x: 10, y: 18 }, { ...fieldPose, selectedTool: "seed" }));
  const growing = (await state.read("shed-A", roomId)).world.farm.find(t => t.x === 10 && t.y === 18)!;
  assert.equal(growing.cropType, "sproutberry");
  if (weatherFor(roomId, 1).id !== "rain") await act("shed-B", action("tool", { tool: "water", x: 10, y: 18 }, { ...fieldPose, selectedTool: "water" }));
  assert.equal((await state.read("shed-A", roomId)).world.farm.find(t => t.x === 10 && t.y === 18)?.wateredToday, true);
  assert.equal((await state.read("shed-A", roomId)).stats?.stamina, 45, "B의 농사가 A의 체력을 소모하지 않음");
  const sleepPose = { ...farmPose, mapId: "farmhouse", x: 304, y: 224 };
  await act("shed-B", action("sleep", {}, sleepPose));
  const tomorrow = await state.read("shed-A", roomId);
  assert.equal(tomorrow.world.daySerial, 2);
  assert.equal(tomorrow.world.farm.find(t => t.x === 10 && t.y === 18)?.cropStage, 1);
  assert.equal(tomorrow.stats?.stamina, 100, "잠자기는 각 플레이어 체력을 회복함");
  assert.equal(tomorrow.world.storage?.containers.family_chest.id, "family_chest");
  assert.equal(tomorrow.world.buildings?.instances[0].status, "ready");
  const rainyDay = Array.from({ length: 130 }, (_, i) => i + 2).find(day => weatherFor(roomId, day).id === "rain")!;
  assert.ok(rainyDay);
  await db.prepare("UPDATE family_state SET world_json=json_set(world_json,'$.daySerial',?,'$.day',?) WHERE room_id=?")
    .bind(rainyDay, (rainyDay - 1) % 28 + 1, roomId).run();
  await act("shed-B", action("tool", { tool: "hoe", x: 11, y: 18 }, { ...fieldPose, x: 10.5 * 32 }));
  assert.equal((await state.read("shed-A", roomId)).world.farm.find(t => t.x === 11 && t.y === 18)?.wateredToday, true, "expanded field receives rain");
  const machine = await act("shed-B", action("place", { definitionId: "wood_processor", tileX: 7, tileY: 13 }, { ...farmPose, x: 208, y: 432 }));
  assert.equal(machine.world.placeables?.instances.length, 1);
  assert.deepEqual(machine.world.placeables?.instances[0].state.machine, idleMachine());
  assert.equal((await state.read("shed-A", roomId)).inventory.items.wood_processor ?? 0, 0);
  assert.deepEqual((await state.read("shed-B", roomId)).world.placeables, machine.world.placeables);
  console.log("Building expansion: placement, costs, farm growth, saves, Family sharing and CAS passed");
} finally { close(); }
