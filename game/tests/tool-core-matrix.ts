import { strict as assert } from "node:assert";
import { resolveToolTarget } from "../actions/ToolTargetResolver";
import { DEFAULT_CROP_ID, getCropDefinition } from "../data/crops";
import { Inventory, type FarmTileData } from "../domain";
import { applyFarmToolEffect } from "../farm/toolBehavior";
import { emptyFarmTreeState, findFarmTree, isFarmTreeObject, strikeFarmTree } from "../farm/trees";
import { MAP_DEFINITIONS, tilePoint } from "../maps/definitions";
import { generateMineFloor } from "../mine/generation";
import { emptyMineDaily, initialMineProgress, mineResourceKind, strikeMineNode } from "../mine/resources";
import { initialPlayerStats } from "../player/stats";
import { initialWateringCan, refillWateringCan } from "../tools/wateringCan";

const farmTile = (overrides: Partial<FarmTileData> = {}): FarmTileData => ({
  x: 9, y: 8, tilled: false, wateredToday: false, cropType: null, cropStage: null, plantedDay: null, ...overrides,
});
const effectContextBase = () => ({
  selectedCrop: DEFAULT_CROP_ID,
  inventory: new Inventory({ items: { sproutberry_seed: 2 } }),
  stats: initialPlayerStats(),
  wateringCan: initialWateringCan(),
  toolProgression: { axe: 1, pickaxe: 1 } as const,
  day: 1,
  raining: false,
});
const effectContext = (overrides: Partial<ReturnType<typeof effectContextBase>> = {}) => ({ ...effectContextBase(), ...overrides });

// Hoe matrix.
const normal = farmTile(), hoe = effectContext();
assert.equal(applyFarmToolEffect("hoe", normal, hoe).changed, true);
assert.equal(normal.tilled, true, "normal farm soil becomes tilled");
const alreadyTilled = farmTile({ tilled: true }), alreadyHoe = effectContext();
assert.equal(applyFarmToolEffect("hoe", alreadyTilled, alreadyHoe).changed, false);
assert.equal(alreadyHoe.stats.stamina, alreadyHoe.stats.maxStamina, "already tilled soil spends no stamina");
const invalid = resolveToolTarget({
  tool: "hoe", facing: "down", mapId: "farm", inputSource: "pointer",
  player: tilePoint(7.5, 7.5), playerAnchor: tilePoint(7.5, 7.5), targetWorld: tilePoint(7.5, 8.5), map: MAP_DEFINITIONS.farm,
});
assert.equal(invalid.targetKind, "none", "invalid terrain has no gameplay target");

// Seed matrix.
const seedTile = farmTile({ tilled: true }), seed = effectContext();
assert.equal(applyFarmToolEffect("seed", seedTile, seed).changed, true);
assert.equal(seedTile.cropStage, 0);
assert.equal(seed.inventory.count(getCropDefinition(DEFAULT_CROP_ID).seedItemId), 1);
assert.equal(applyFarmToolEffect("seed", farmTile(), effectContext()).changed, false, "untilled soil rejects seed");
assert.equal(applyFarmToolEffect("seed", farmTile({ tilled: true, cropType: DEFAULT_CROP_ID, cropStage: 0, plantedDay: 1 }), effectContext()).changed, false,
  "occupied soil rejects seed");

// Water matrix, including empty tilled soil.
for (const tile of [
  farmTile({ tilled: true }),
  farmTile({ tilled: true, cropType: DEFAULT_CROP_ID, cropStage: 0, plantedDay: 1 }),
]) {
  const water = effectContext(), before = water.wateringCan.currentWater;
  assert.equal(applyFarmToolEffect("water", tile, water).changed, true);
  assert.equal(tile.wateredToday, true);
  assert.equal(water.wateringCan.currentWater, before - 1);
  assert.ok(water.stats.stamina < water.stats.maxStamina);
}
const grassWater = effectContext(), grassBefore = grassWater.wateringCan.currentWater;
assert.equal(applyFarmToolEffect("water", farmTile(), grassWater).changed, false);
assert.equal(grassWater.wateringCan.currentWater, grassBefore, "grass is visual-only");
const wet = farmTile({ tilled: true, wateredToday: true }), wetWater = effectContext(), wetBefore = wetWater.wateringCan.currentWater;
assert.equal(applyFarmToolEffect("water", wet, wetWater).changed, false);
assert.equal(wetWater.wateringCan.currentWater, wetBefore);
const emptyCan = effectContext(); emptyCan.wateringCan.currentWater = 0;
assert.equal(applyFarmToolEffect("water", farmTile({ tilled: true }), emptyCan).changed, false);
assert.equal(emptyCan.stats.stamina, emptyCan.stats.maxStamina);

// Refill matrix.
const pondTarget = tilePoint(24.5, 15.5);
const refillTarget = resolveToolTarget({
  tool: "water", facing: "down", mapId: "farm", inputSource: "keyboard",
  player: tilePoint(24.5, 14.5), playerAnchor: tilePoint(24.5, 14.5), targetWorld: pondTarget, map: MAP_DEFINITIONS.farm,
});
assert.equal(refillTarget.targetKind, "water_source");
const can = initialWateringCan(); can.currentWater = 1;
assert.equal(refillWateringCan(can), true); assert.equal(can.currentWater, can.capacity);
const awayFromPond = resolveToolTarget({ ...{
  tool: "water" as const, facing: "left" as const, mapId: "farm", inputSource: "keyboard" as const,
  player: tilePoint(20.5, 10.5), playerAnchor: tilePoint(20.5, 10.5), targetWorld: tilePoint(19.5, 10.5), map: MAP_DEFINITIONS.farm,
} });
assert.notEqual(awayFromPond.targetKind, "water_source", "not facing water cannot refill");

// Axe matrix and trunk-only targeting.
const tree = MAP_DEFINITIONS.farm.objects.find(isFarmTreeObject)!;
const trunk = tilePoint(tree.position.tileX, tree.position.tileY);
assert.equal(findFarmTree(MAP_DEFINITIONS.farm, trunk, { x: trunk.x - 32, y: trunk.y })?.id, tree.id);
assert.equal(findFarmTree(MAP_DEFINITIONS.farm, { x: trunk.x, y: trunk.y - 100 }, { x: trunk.x - 32, y: trunk.y }), undefined,
  "the 128x160 crown is not a hit area");
let treeState = emptyFarmTreeState(), wood = 0, pineNeedles = 0, pineCones = 0;
for (let hit = 0; hit < 3; hit++) {
  const result = strikeFarmTree(treeState, tree, "axe", { axe: 1, pickaxe: 1 });
  treeState = result.state;
  for (const drop of result.drops ?? []) {
    if (drop.itemId === "wood") wood += drop.quantity;
    if (drop.itemId === "pine_needles") pineNeedles += drop.quantity;
    if (drop.itemId === "pine_cone") pineCones += drop.quantity;
  }
}
assert.ok(treeState.stumps.includes(tree.id)); assert.deepEqual([wood, pineNeedles, pineCones], [1, 1, 1]);
for (let hit = 0; hit < 3; hit++) treeState = strikeFarmTree(treeState, tree, "axe", { axe: 1, pickaxe: 1 }).state;
assert.ok(treeState.depleted.includes(tree.id), "stump needs three more Lv1 axe hits");
assert.equal(strikeFarmTree(emptyFarmTreeState(), tree, "hand").state.hits[tree.id], undefined, "empty space/wrong tool changes nothing");

// Pickaxe farm undo and existing mine behavior.
const emptyTilled = farmTile({ tilled: true, wateredToday: true }), pickaxe = effectContext();
assert.equal(applyFarmToolEffect("pickaxe", emptyTilled, pickaxe).changed, true); assert.equal(emptyTilled.tilled, false);
const planted = farmTile({ tilled: true, cropType: DEFAULT_CROP_ID, cropStage: 0, plantedDay: 1 }), plantedBefore = structuredClone(planted);
assert.equal(applyFarmToolEffect("pickaxe", planted, effectContext()).changed, false); assert.deepEqual(planted, plantedBefore);
const mine = generateMineFloor("tool-core", 1, 1), node = mine.objects.find((entry) => mineResourceKind(entry))!;
const mineHit = strikeMineNode(emptyMineDaily(1), initialMineProgress(), 1, node, { axe: 1, pickaxe: 1 });
assert.ok(mineHit, "rock/ore keeps existing mining behavior");

// Harvest matrix.
const matureStage = getCropDefinition(DEFAULT_CROP_ID).stages.length - 1;
const mature = farmTile({ tilled: true, cropType: DEFAULT_CROP_ID, cropStage: matureStage, plantedDay: 1 }), harvest = effectContext();
assert.equal(applyFarmToolEffect("hand", mature, harvest).changed, true); assert.equal(mature.cropType, null);
const immature = farmTile({ tilled: true, cropType: DEFAULT_CROP_ID, cropStage: 0, plantedDay: 1 }), immatureBefore = structuredClone(immature);
assert.equal(applyFarmToolEffect("hand", immature, effectContext()).changed, false); assert.deepEqual(immature, immatureBefore);

console.log("Tool Core matrix: hoe, seed, water/refill, axe, pickaxe/mining and harvest passed");
