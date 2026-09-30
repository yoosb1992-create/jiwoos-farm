import { strict as assert } from "node:assert";
import { WORLD_OBJECT_ASSETS } from "../assets/definitions";
import { FARM_TERRAIN_DECORATIONS } from "../assets/terrainComposition";
import { initialBuildings, buildingPlacementError } from "../buildings/system";
import { MAP_DEFINITIONS, getTileTypeInMap } from "../maps/definitions";
import type { MapDefinition, TileRect } from "../maps/types";
import { initialPlaceables, placementError } from "../placeables/system";

const farm = MAP_DEFINITIONS.farm;
const contains = (rect: TileRect, x: number, y: number) => x >= rect.startX && x <= rect.endX && y >= rect.startY && y <= rect.endY;

assert.deepEqual([farm.width, farm.height], [42, 26], "initial composition preserves the farm map size");
assert.deepEqual(farm.farmAreas, [{ startX: 9, endX: 18, startY: 8, endY: 14 }]);
assert.deepEqual(farm.collisionRegions, [{ startX: 24, endX: 30, startY: 15, endY: 20 }]);
assert.deepEqual(farm.warps.find(warp => warp.id === "house_door")?.area, { startX: 4, endX: 6, startY: 8, endY: 9 });
assert.deepEqual(farm.warps.find(warp => warp.id === "exit_south")?.area, { startX: 19, endX: 22, startY: 24, endY: 25 });

const trees = farm.objects.filter(object => ["tree", "tree_variant_a", "tree_variant_b"].includes(object.assetId));
const treeAssets = { tree: WORLD_OBJECT_ASSETS.tree, tree_variant_a: WORLD_OBJECT_ASSETS.tree_variant_a, tree_variant_b: WORLD_OBJECT_ASSETS.tree_variant_b } as const;
assert.equal(trees.length, 12, "the farm boundary uses a restrained set of oversized trees");
for (const tree of trees) {
  assert.ok(tree.id.startsWith("farm_tree_"));
  assert.deepEqual(tree.collision, treeAssets[tree.assetId as keyof typeof treeAssets].defaultCollisionBox, `${tree.id}: crown size must not enlarge trunk collision`);
  assert.ok(tree.position.tileX >= 0 && tree.position.tileX < farm.width && tree.position.tileY >= 0 && tree.position.tileY < farm.height);
  assert.ok(!farm.farmAreas.some(area => contains(area, tree.position.tileX, tree.position.tileY)), `${tree.id}: farmable area stays clear`);
  assert.ok(!farm.warps.some(warp => contains(warp.area, tree.position.tileX, tree.position.tileY)), `${tree.id}: warp stays clear`);
}

assert.equal(FARM_TERRAIN_DECORATIONS.length, 41, "authored decoration set is richer but bounded");
assert.equal(new Set(FARM_TERRAIN_DECORATIONS.map(item => `${item.assetId}:${item.tileX}:${item.tileY}`)).size, FARM_TERRAIN_DECORATIONS.length);
for (const decoration of FARM_TERRAIN_DECORATIONS) {
  assert.ok(decoration.tileX >= 0 && decoration.tileX < farm.width && decoration.tileY >= 0 && decoration.tileY < farm.height);
  assert.ok(!farm.farmAreas.some(area => contains(area, decoration.tileX, decoration.tileY)), "decorations do not cover farmable tiles");
  assert.ok(!farm.warps.some(warp => contains(warp.area, decoration.tileX, decoration.tileY)), "decorations do not cover a warp");
}
for (const lily of FARM_TERRAIN_DECORATIONS.filter(item => item.assetId === "decor_lily_pads")) {
  assert.ok(contains(farm.collisionRegions[0], lily.tileX, lily.tileY), "lily pads stay on pond water");
}

const pathTiles = new Set<string>();
for (let y = 0; y < farm.height; y++) for (let x = 0; x < farm.width; x++) {
  if (getTileTypeInMap(farm, x, y) === "path") pathTiles.add(`${x},${y}`);
}
const connectedBy = (allowed: Set<string>, start: [number, number], target: [number, number]) => {
  const queue: Array<[number, number]> = [start], visited = new Set([`${start[0]},${start[1]}`]);
  while (queue.length) {
    const [x, y] = queue.shift()!;
    if (x === target[0] && y === target[1]) return true;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const key = `${x + dx},${y + dy}`;
      if (allowed.has(key) && !visited.has(key)) { visited.add(key); queue.push([x + dx, y + dy]); }
    }
  }
  return false;
};
for (const target of [[20, 25], [25, 14], [33, 9]] as const) {
  assert.ok(connectedBy(pathTiles, [5, 9], [...target]), `authored path connects the house yard to ${target.join(",")}`);
}
assert.ok(pathTiles.size < 150, "the previous full-width path rectangle is no longer present");

const pixelOverlaps = (left: { x: number; y: number; width: number; height: number }, right: { x: number; y: number; width: number; height: number }) =>
  left.x < right.x + right.width && left.x + left.width > right.x && left.y < right.y + right.height && left.y + left.height > right.y;
const openTiles = new Set<string>();
for (let y = 0; y < farm.height; y++) for (let x = 0; x < farm.width; x++) {
  const tileType = getTileTypeInMap(farm, x, y);
  if (!["grass", "path", "farm"].includes(tileType)) continue;
  const tile = { x: x * 32 + 6, y: y * 32 + 6, width: 20, height: 20 };
  const blockedByObject = farm.objects.some(object => object.collision && pixelOverlaps(tile, {
    x: object.position.tileX * 32 + object.collision.x,
    y: object.position.tileY * 32 + object.collision.y,
    width: object.collision.width,
    height: object.collision.height,
  }));
  if (!blockedByObject) openTiles.add(`${x},${y}`);
}
for (const target of [[8, 12], [25, 14], [20, 24], [33, 9]] as const) {
  assert.ok(connectedBy(openTiles, [5, 9], [...target]), `mobile traversal remains open to ${target.join(",")}`);
}

const buildings = initialBuildings(), placeables = initialPlaceables(), players: { x: number; y: number; mapId: string }[] = [];
for (const [definitionId, x, y] of [["work_shed", 4, 17], ["work_shed", 14, 17], ["chicken_coop", 32, 14]] as const) {
  assert.equal(buildingPlacementError(buildings, placeables, [], farm, definitionId, x, y, players), null, `${definitionId} clearing ${x},${y}`);
}
for (const [x, y] of [[6, 20], [35, 18]] as const) {
  assert.equal(placementError(placeables, "wood_processor", farm, x, y, players, buildings), null, `machine clearing ${x},${y}`);
}

const basket = farm.objects.find(object => object.id === "sell_basket")!;
assert.deepEqual(basket.interaction?.area, { startX: 31, endX: 35, startY: 6, endY: 9 }, "sell basket remains accessible");

console.log("Graphics 1.3 initial farm composition: paths, pond, trees, authored decoration, clearings and traversal contracts passed");
