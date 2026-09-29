import { strict as assert } from "node:assert";
import { FamilyProgress } from "../../server/family/progress";
import { FamilyPresenceService } from "../../server/family/presence";
import { FamilyRooms } from "../../server/family/rooms";
import { FamilyState } from "../../server/family/state";
import { ANIMAL_DEFINITIONS } from "../animals/definitions";
import { advanceRanchDay, buyAnimal, collectAnimalProduce, feedCoop, initialRanchState, petAnimal } from "../animals/system";
import { CROP_ASSETS, ITEM_ASSETS, WORLD_OBJECT_ASSETS } from "../assets/definitions";
import { BUILDING_DEFINITIONS } from "../buildings/definitions";
import { buildingPlacementError, constructBuilding, initialBuildings } from "../buildings/system";
import { CRAFTING_RECIPES } from "../crafting/definitions";
import { craft } from "../crafting/engine";
import { CROP_DEFINITIONS } from "../data/crops";
import { ITEM_DEFINITIONS, type ItemId } from "../data/items";
import { GENERAL_STORE_LISTINGS } from "../data/shop";
import { advanceFarmDay, Inventory, normalizeSaveData, type FarmTileData } from "../domain";
import { sellMarketGoods } from "../economy/sales";
import { FARM_EXPANSIONS, initialFarmProgress, unlockExpansion } from "../farm/expansions";
import { visibleFamilyPlayers } from "../family/presence";
import type { FamilyPose } from "../family/types";
import { FISH_DEFINITIONS, FISHING_SPOTS } from "../fishing/definitions";
import { beginFishing, initialFishingProgress, reelFishing } from "../fishing/system";
import { recoverForestPosition, safeForestPosition } from "../forest/generation";
import { emptyForestState } from "../forest/resources";
import { installFairyForest } from "../forest/registry";
import { MACHINE_PROCESSES } from "../machines/definitions";
import { advanceMachine, collectMachine, startMachine } from "../machines/system";
import { MapRegistry } from "../maps/MapRegistry";
import { MAP_DEFINITIONS, TILE_TYPE_DEFINITIONS, tilePoint } from "../maps/definitions";
import { generateMineFloor } from "../mine/generation";
import { emptyMineDaily, initialMineProgress, mineResourceKind, strikeMineNode } from "../mine/resources";
import { installMine } from "../mine/registry";
import { NPC_DEFINITIONS, validateNpcs } from "../npc/definitions";
import { giftToNpc } from "../npc/gifts";
import { normalizeProgress, talkToNpc } from "../npc/progress";
import { initialPlaceables, placeObject, placementError } from "../placeables/system";
import { initialPlayerStats, recordSuccessfulAction, restoreStamina } from "../player/stats";
import { QUEST_DEFINITIONS, getQuest } from "../quests/definitions";
import { applyQuestAction, recordNpcGreeting } from "../quests/engine";
import { RELATIONSHIP_EVENT_DEFINITIONS } from "../relationship-events/definitions";
import { completeRelationshipEvent, startRelationshipEvent } from "../relationship-events/system";
import { initialStorage, transferItem } from "../storage/container";
import { TOOL_UPGRADES } from "../tools/definitions";
import { upgradeTool } from "../tools/progression";
import { calendarDate, worldMinute } from "../world/calendar";
import { weatherFor } from "../weather/system";
import { familyTestDB } from "./family-db";

const itemExists = (id: ItemId) => Boolean(ITEM_DEFINITIONS[id]);

// Runtime maps include both authored maps and the procedural Forest/Mine maps.
const registry = new MapRegistry();
assert.equal(installFairyForest(registry, "integration", 1), true);
assert.equal(installMine(registry, "integration", 1), true);
for (const map of registry.entries()) {
  assert.ok(map.spawns.length, `${map.id}: at least one spawn`);
  assert.equal(new Set(map.spawns.map(spawn => spawn.id)).size, map.spawns.length, `${map.id}: unique spawns`);
  assert.equal(new Set(map.warps.map(warp => warp.id)).size, map.warps.length, `${map.id}: unique warps`);
  assert.equal(new Set(map.objects.map(object => object.id)).size, map.objects.length, `${map.id}: unique objects`);
  assert.ok(TILE_TYPE_DEFINITIONS[map.baseTileType]);
  for (const region of map.terrainRegions) assert.ok(TILE_TYPE_DEFINITIONS[region.tileType]);
  for (const object of map.objects) assert.ok(WORLD_OBJECT_ASSETS[object.assetId], `${map.id}.${object.id}: asset reference`);
  for (const spawn of map.spawns) {
    assert.ok(spawn.tileX >= 0 && spawn.tileX < map.width && spawn.tileY >= 0 && spawn.tileY < map.height);
    assert.ok(safeForestPosition(map, spawn.tileX * 32, spawn.tileY * 32), `${map.id}.${spawn.id}: safe spawn`);
  }
  for (const warp of map.warps) {
    const target = registry.get(warp.targetMapId);
    assert.ok(target, `${map.id}.${warp.id}: target map`);
    assert.ok(target!.spawns.some(spawn => spawn.id === warp.targetSpawnId), `${map.id}.${warp.id}: target spawn`);
  }
}
assert.deepEqual(validateNpcs(NPC_DEFINITIONS, registry), [], "NPC schedules remain valid on the integrated registry");

// Cross-system definition references fail here instead of becoming runtime undefined access.
for (const crop of Object.values(CROP_DEFINITIONS)) {
  assert.ok(itemExists(crop.seedItemId) && itemExists(crop.harvestItemId));
  for (const stage of crop.stages) assert.ok(CROP_ASSETS[stage.assetId]);
}
for (const item of Object.values(ITEM_DEFINITIONS)) assert.ok(ITEM_ASSETS[item.assetId], `${item.id}: item asset`);
for (const listing of GENERAL_STORE_LISTINGS) assert.ok(itemExists(listing.itemId) && listing.price >= 0 && listing.quantity > 0);
for (const recipe of Object.values(CRAFTING_RECIPES)) {
  assert.ok(itemExists(recipe.output.itemId));
  for (const input of recipe.ingredients) assert.ok(itemExists(input.itemId) && input.quantity > 0);
}
for (const upgrade of Object.values(TOOL_UPGRADES)) for (const material of upgrade.materials) assert.ok(itemExists(material.itemId));
for (const process of Object.values(MACHINE_PROCESSES)) assert.ok(itemExists(process.input.itemId) && itemExists(process.output.itemId));
for (const building of Object.values(BUILDING_DEFINITIONS)) {
  assert.ok(WORLD_OBJECT_ASSETS[building.assetId]);
  for (const mapId of building.maps) assert.ok(MAP_DEFINITIONS[mapId]);
  for (const material of building.cost.materials) assert.ok(itemExists(material.itemId));
}
for (const animal of Object.values(ANIMAL_DEFINITIONS)) {
  assert.ok(itemExists(animal.produceItemId) && WORLD_OBJECT_ASSETS[animal.assetId]);
  for (const buildingId of animal.homeBuildingTypes) assert.ok(BUILDING_DEFINITIONS[buildingId]);
}
for (const fish of Object.values(FISH_DEFINITIONS)) {
  assert.ok(itemExists(fish.itemId) && fish.weight > 0 && fish.sellPrice > 0);
  for (const spotId of fish.spots) assert.ok(FISHING_SPOTS[spotId]);
}
for (const npc of NPC_DEFINITIONS) for (const itemId of [...npc.giftPreferences.loved, ...npc.giftPreferences.neutral, ...npc.giftPreferences.disliked]) assert.ok(itemExists(itemId));
for (const quest of QUEST_DEFINITIONS) {
  assert.ok(NPC_DEFINITIONS.some(npc => npc.id === quest.giver));
  for (const prerequisite of quest.requires) assert.ok(getQuest(prerequisite));
  if (quest.objective.kind === "deliver") assert.ok(itemExists(quest.objective.itemId));
  for (const itemId of Object.keys(quest.reward.items) as ItemId[]) assert.ok(itemExists(itemId));
}
for (const event of Object.values(RELATIONSHIP_EVENT_DEFINITIONS)) {
  assert.ok(NPC_DEFINITIONS.some(npc => npc.id === event.npcId) && registry.has(event.mapId));
  for (const prerequisite of event.requiredQuestIds ?? []) assert.ok(getQuest(prerequisite));
  for (const prerequisite of event.requiredEventIds ?? []) assert.ok(RELATIONSHIP_EVENT_DEFINITIONS[prerequisite]);
  assert.ok(event.scene.length && event.scene.at(-1)?.kind === "complete");
}

// A blocked/corrupt authored-map position recovers to that map's own spawn, not a Forest coordinate.
const farmSpawn = MAP_DEFINITIONS.farm.spawns[0], farmFallback = tilePoint(farmSpawn.tileX, farmSpawn.tileY);
assert.deepEqual(recoverForestPosition(MAP_DEFINITIONS.farm, { x: 5 * 32, y: 5 * 32 }, farmFallback), farmFallback);

// One SaveData object travels through farming, economy, crafting, tools, storage,
// machines, expansion, buildings, mining, fishing, ranching, quests, gifts and events.
let daySerial = 1, money = 1_000;
const bag = new Inventory({ items: { sproutberry_seed: 8, wood: 40, stone: 30, wild_herb: 2, fairy_bloom: 1, animal_feed: 2 } });
const stats = initialPlayerStats(), tools = { axe: 1, pickaxe: 0 } as const;
const mutableTools = { ...tools };
const farm: FarmTileData[] = [{ x: 9, y: 8, tilled: true, wateredToday: true, cropType: "sproutberry", cropStage: 0, plantedDay: 1 }];
assert.equal(bag.consume("sproutberry_seed"), true);
recordSuccessfulAction(stats, "hoe"); recordSuccessfulAction(stats, "water");
for (let i = 0; i < 3; i++) { advanceFarmDay(farm); daySerial++; if (i < 2) farm[0].wateredToday = true; }
assert.equal(farm[0].cropStage, 3);
bag.add("sproutberry"); recordSuccessfulAction(stats, "harvest");
Object.assign(farm[0], { cropType: null, cropStage: null, plantedDay: null, wateredToday: false });
const cropSale = sellMarketGoods(bag); money += cropSale.earned;
assert.deepEqual(cropSale, { amount: 1, earned: CROP_DEFINITIONS.sproutberry.sellPrice });

for (let i = 0; i < 12; i++) assert.equal(craft(bag, CRAFTING_RECIPES.wood_plank), true);
for (let i = 0; i < 6; i++) assert.equal(craft(bag, CRAFTING_RECIPES.stone_block), true);
assert.equal(craft(bag, CRAFTING_RECIPES.fairy_thread), true);
assert.equal(upgradeTool(bag, mutableTools, TOOL_UPGRADES.pickaxe_unlock), true);
assert.equal(upgradeTool(bag, mutableTools, TOOL_UPGRADES.axe_2), true);
assert.deepEqual(mutableTools, { axe: 2, pickaxe: 1 });

const storage = initialStorage();
assert.equal(transferItem(bag, storage, "family_chest", "deposit", "stone", 3), null);
assert.equal(transferItem(bag, storage, "family_chest", "withdraw", "stone", 1), null);
assert.equal(storage.containers.family_chest.items.stone, 2);

assert.equal(craft(bag, CRAFTING_RECIPES.wood_processor), true);
const placeables = initialPlaceables(), buildings = initialBuildings(), map = MAP_DEFINITIONS.farm;
let machineTile: { x: number; y: number } | undefined;
for (let y = 1; y < map.height && !machineTile; y++) for (let x = 1; x < map.width && !machineTile; x++)
  if (!placementError(placeables, "wood_processor", map, x, y, [], buildings)) machineTile = { x, y };
assert.ok(machineTile);
assert.equal(placeObject(placeables, bag, "wood_processor", map, machineTile!.x, machineTile!.y, [], "processor-1", buildings), null);
const machine = placeables.instances[0].state.machine, machineStart = worldMinute(daySerial, 600);
assert.equal(startMachine(machine, bag, "saw_wood", machineStart), null);
advanceMachine(machine, machineStart + MACHINE_PROCESSES.saw_wood.durationMinutes);
assert.equal(collectMachine(machine, bag, machineStart + MACHINE_PROCESSES.saw_wood.durationMinutes), null);

const farmProgress = initialFarmProgress();
const expanded = unlockExpansion(farmProgress, farm, bag, money, "south_plot", placeables, buildings);
assert.equal(expanded.error, null); money = expanded.money;
assert.ok(farm.some(tile => tile.x === FARM_EXPANSIONS.south_plot.area.startX && tile.y === FARM_EXPANSIONS.south_plot.area.startY));

const build = (definitionId: "work_shed" | "chicken_coop", id: string) => {
  let tile: { x: number; y: number } | undefined;
  for (let y = 1; y < map.height && !tile; y++) for (let x = 1; x < map.width && !tile; x++)
    if (!buildingPlacementError(buildings, placeables, farm, map, definitionId, x, y, [])) tile = { x, y };
  assert.ok(tile, `${definitionId}: constructible tile`);
  const result = constructBuilding(buildings, placeables, farm, bag, money, map, definitionId, tile!.x, tile!.y, [], id, daySerial);
  assert.equal(result.error, null); money = result.money;
};
build("work_shed", "shed-1"); build("chicken_coop", "coop-1");

let mineDaily = emptyMineDaily(daySerial), mineProgress = initialMineProgress();
const mineNode = generateMineFloor("single", daySerial, 1).objects.find(node => mineResourceKind(node) === "copper")!;
for (;;) {
  const result = strikeMineNode(mineDaily, mineProgress, 1, mineNode, mutableTools);
  assert.ok(result); mineDaily = result!.daily; mineProgress = result!.progress; recordSuccessfulAction(stats, "pickaxe");
  if (result!.drop) { bag.add(result!.drop, result!.quantity); break; }
}
assert.ok(bag.count("copper_ore") > 0);

let fishingProgress = initialFishingProgress();
const fishPose: FamilyPose = { mapId: "farm", x: 26.5 * 32, y: 14.5 * 32, facing: "down", selectedTool: "fishing_rod", moving: false };
const cast = beginFishing(fishingProgress, null, fishPose, "farm_pond", "single", "single", daySerial,
  weatherFor("single", daySerial).id, 600, stats);
assert.equal(cast.error, undefined); fishingProgress = cast.progress!;
const caught = reelFishing(cast.cast!, cast.cast!.id, fishingProgress, bag, stats, daySerial, 604);
assert.ok(caught.fish); assert.ok(fishingProgress.caughtFishIds.includes(caught.fish!.id));

const ranchState = initialRanchState();
const purchased = buyAnimal(ranchState, buildings, money, "chicken", "coop-1", "chicken-1", daySerial);
assert.equal(purchased.error, null); money = purchased.money;
assert.equal(feedCoop(ranchState, buildings, bag, "coop-1", daySerial), null);
assert.equal(petAnimal(ranchState, "chicken-1", daySerial), null);
assert.equal(advanceRanchDay(ranchState, daySerial, daySerial + 1), true); daySerial++;
assert.equal(collectAnimalProduce(ranchState, bag, "chicken-1"), null);
const animalSale = sellMarketGoods(bag); money += animalSale.earned;
assert.ok(animalSale.amount >= 2 && animalSale.earned >= ANIMAL_DEFINITIONS.chicken.produceSellPrice, "fish and egg use the general market path");

const playerProgress = normalizeProgress(null);
money = applyQuestAction(playerProgress, bag, money, { kind: "quest-start", questId: "village_hello" });
for (const npc of NPC_DEFINITIONS) { talkToNpc(playerProgress, npc.id, calendarDate(daySerial).day, 600, daySerial); recordNpcGreeting(playerProgress, npc.id); }
money = applyQuestAction(playerProgress, bag, money, { kind: "quest-reward", questId: "village_hello" });
assert.equal(giftToNpc(playerProgress, bag, "boram", "wood", daySerial).error, null);
const event = startRelationshipEvent(playerProgress, "boram_soil_note", { daySerial, timeMinutes: 500, mapId: "farm", weather: weatherFor("single", daySerial).id });
assert.equal(event.error, null); assert.equal(completeRelationshipEvent(playerProgress, "boram_soil_note"), null);

restoreStamina(stats);
const latest = normalizeSaveData({ version: 4, day: calendarDate(daySerial).day, daySerial, timeMinutes: 604, money, selectedTool: "fishing_rod",
  player: { mapId: "farm", ...farmFallback, facing: "down" }, inventory: bag.serialize(), farm, toolProgression: mutableTools,
  playerProgress, forestState: emptyForestState(daySerial), stats, storage, placeables, buildings, farmProgress, mineProgress, mineDaily,
  fishingProgress, ranchState, savedAt: 2_000 })!;
const roundTrip = normalizeSaveData(JSON.parse(JSON.stringify(latest)))!;
assert.deepEqual(roundTrip, latest, "latest integrated save survives JSON and normalization without state loss");

// Corrupt optional branches are pruned independently while the valid integrated state survives.
const corrupt = JSON.parse(JSON.stringify(latest));
corrupt.inventory.items.not_an_item = 99;
corrupt.storage.containers.family_chest.items.not_an_item = 99;
corrupt.placeables.instances.push({ ...corrupt.placeables.instances[0], id: "outside-machine", tileX: 999 });
corrupt.buildings.instances.push({ ...corrupt.buildings.instances[0], id: "outside-building", tileX: 999 });
corrupt.ranchState.animals.push({ ...corrupt.ranchState.animals[0], id: "orphan", homeBuildingId: "deleted" });
corrupt.fishingProgress.caughtFishIds.push("not-a-fish");
corrupt.playerProgress.seenEventIds.push("not-an-event");
corrupt.mineDaily.floors[1] = { hits: { "not-a-node": 1 }, depleted: ["not-a-node"] };
const recovered = normalizeSaveData(corrupt)!;
assert.equal((recovered.inventory.items as Record<string, number>).not_an_item, undefined);
assert.equal((recovered.storage!.containers.family_chest.items as Record<string, number>).not_an_item, undefined);
assert.equal(recovered.placeables!.instances.some(instance => instance.id === "outside-machine"), false);
assert.equal(recovered.buildings!.instances.some(instance => instance.id === "outside-building"), false);
assert.equal(recovered.ranchState!.animals.some(animal => animal.id === "orphan"), false);
assert.deepEqual(recovered.fishingProgress, latest.fishingProgress);
assert.deepEqual(recovered.playerProgress, latest.playerProgress);
assert.equal(recovered.money, latest.money); assert.deepEqual(recovered.farmProgress, latest.farmProgress);

for (const serial of [28, 56, 84, 112]) {
  const next = calendarDate(serial + 1);
  assert.deepEqual(next, serial === 112
    ? { year: 2, season: "spring", day: 1, daySerial: 113 }
    : { year: 1, season: (["summer", "autumn", "winter"] as const)[serial / 28 - 1], day: 1, daySerial: serial + 1 });
  assert.ok(weatherFor("integration", serial + 1));
  assert.notDeepEqual(generateMineFloor("integration", serial, 1), generateMineFloor("integration", serial + 1, 1));
}

// Two-player integration: shared world survives actions/reconnect while personal
// bags, stats, tools, fishing and NPC progress remain isolated.
const { db, close } = familyTestDB();
try {
  let now = 100_000;
  const rooms = new FamilyRooms(db, () => now), state = new FamilyState(db, () => now), presence = new FamilyPresenceService(db, () => now);
  const a = await rooms.create("integration-A", "2.0 통합 농장", "A");
  const b = await rooms.join("integration-B", a.room.inviteCode, "B");
  const roomId = a.room.id;
  await state.read("integration-A", roomId);
  await db.prepare("UPDATE family_state SET inventories_json=? WHERE room_id=?").bind(JSON.stringify({
    [a.room.playerId]: { items: { sproutberry_seed: 8, wood: 4 }, toolProgression: { axe: 2, pickaxe: 1 }, stats: { ...initialPlayerStats(), stamina: 70 }, fishingProgress: { castSequence: 2, caughtFishIds: ["minnow"] } },
    [b.room.playerId]: { items: { sproutberry_seed: 8 }, toolProgression: { axe: 1, pickaxe: 0 }, stats: { ...initialPlayerStats(), stamina: 91 }, fishingProgress: initialFishingProgress() },
  }), roomId).run();
  const farmPose: FamilyPose = { mapId: "farm", x: 9.5 * 32, y: 8.5 * 32, facing: "down", selectedTool: "hoe", moving: false };
  const base = await state.read("integration-A", roomId), hoe = { kind: "tool", tool: "hoe", x: 9, y: 8, pose: farmPose } as const;
  const race = await Promise.allSettled([state.act("integration-A", roomId, base.revision, hoe), state.act("integration-B", roomId, base.revision, hoe)]);
  assert.equal(race.filter(result => result.status === "fulfilled").length, 1, "integrated world CAS has one winner");
  const chestPose: FamilyPose = { mapId: "farmhouse", x: 3 * 32, y: 4 * 32, facing: "up", selectedTool: "hand", moving: false };
  const current = await state.read("integration-A", roomId);
  await state.act("integration-A", roomId, current.revision, { kind: "storage", containerId: "family_chest", direction: "deposit", itemId: "wood", quantity: 2, pose: chestPose });
  const aView = await state.read("integration-A", roomId), bView = await state.read("integration-B", roomId);
  assert.deepEqual(aView.world, bView.world); assert.equal(bView.world.storage?.containers.family_chest.items.wood, 2);
  assert.notDeepEqual(aView.inventory, bView.inventory); assert.notDeepEqual(aView.stats, bView.stats);
  assert.notDeepEqual(aView.toolProgression, bView.toolProgression); assert.notDeepEqual(aView.fishingProgress, bView.fishingProgress);

  const farmSession = crypto.randomUUID(), mineSession = crypto.randomUUID();
  await presence.heartbeat("integration-A", roomId, farmPose, farmSession);
  const minePose: FamilyPose = { mapId: "mine_floor_3", x: 11.5 * 32, y: 14.5 * 32, facing: "up", selectedTool: "pickaxe", moving: false };
  const presenceSnapshot = await presence.heartbeat("integration-B", roomId, minePose, mineSession);
  assert.deepEqual(visibleFamilyPlayers(presenceSnapshot, a.room.playerId, "farm"), [], "different floor/map players are not rendered together");

  const progress = new FamilyProgress(db, () => now);
  const aProgress = await progress.readProgress("integration-A", roomId), bProgress = await progress.readProgress("integration-B", roomId);
  assert.deepEqual(aProgress.data, bProgress.data);
  const npc = NPC_DEFINITIONS[0], npcWorld = npc.schedule[0].from;
  const npcPose: FamilyPose = { mapId: npc.schedule[0].mapId, x: npcWorld.x * 32, y: npcWorld.y * 32, facing: "down", selectedTool: "hand", moving: false };
  await progress.interact("integration-A", roomId, aProgress.revision, { kind: "talk", npcId: npc.id }, npcPose);
  assert.equal((await progress.readProgress("integration-A", roomId)).data.relationships[npc.id].points, 10);
  assert.equal((await progress.readProgress("integration-B", roomId)).data.relationships[npc.id].points, 0);

  now += 500;
  const reconnectedA = await new FamilyState(db, () => now).read("integration-A", roomId);
  const reconnectedB = await new FamilyState(db, () => now).read("integration-B", roomId);
  assert.deepEqual(reconnectedA.world, reconnectedB.world); assert.equal(reconnectedA.world.storage?.containers.family_chest.items.wood, 2);
  assert.equal((await new FamilyProgress(db, () => now).readProgress("integration-A", roomId)).data.relationships[npc.id].points, 10);
} finally { close(); }

assert.ok(GENERAL_STORE_LISTINGS.some(listing => listing.itemId === "animal_feed"));
assert.ok(Object.values(FISH_DEFINITIONS).some(fish => fish.seasons.length === 4), "zero-money recovery remains available through the basic rod");
console.log("2.0 integration: runtime data, complete single save loop, corruption recovery, seasons, Family isolation/CAS/reconnect passed");
