import { strict as assert } from "node:assert";
import { CROP_ASSETS, TILE_ASSETS, WORLD_OBJECT_ASSETS } from "../assets/definitions";
import { GAME_CONFIG } from "../config";
import { MAP_DEFINITIONS } from "../maps/definitions";
import { readAssetPng } from "./png";

const firstPassRoot = "/assets/graphics-first-pass/";
const firstPassTiles = [
  TILE_ASSETS.tile_path,
  TILE_ASSETS.tile_farm_empty,
  TILE_ASSETS.tile_farm_tilled,
  TILE_ASSETS.tile_farm_watered,
  TILE_ASSETS.tile_water,
];
const sproutberryStages = [
  CROP_ASSETS.crop_sproutberry_seed,
  CROP_ASSETS.crop_sproutberry_sprout,
  CROP_ASSETS.crop_sproutberry_growing,
  CROP_ASSETS.crop_sproutberry_mature,
];

assert.equal(GAME_CONFIG.tileSize, 32);
for (const asset of firstPassTiles) {
  assert.equal(asset.source?.kind, "image");
  assert.ok(asset.source?.kind === "image" && asset.source.path.startsWith(`${firstPassRoot}tiles/`));
  assert.deepEqual(asset.frameSize, { width: 32, height: 32 });
}
assert.equal(TILE_ASSETS.tile_grass.source?.kind, "image");
assert.equal(TILE_ASSETS.tile_grass.source?.path, "/assets/graphics-composition/tiles/grass.png", "Graphics 1.2 may replace the First Pass grass without changing its logical contract");
for (const asset of [TILE_ASSETS.tile_grass, TILE_ASSETS.tile_path, TILE_ASSETS.tile_water]) {
  assert.deepEqual(asset.textureSize, { width: 128, height: 128 }, `${asset.assetId}: visual repeat texture is decoupled from the logical tile`);
}
for (const asset of [TILE_ASSETS.tile_farm_empty, TILE_ASSETS.tile_farm_tilled, TILE_ASSETS.tile_farm_watered]) {
  assert.deepEqual(asset.textureSize, { width: 32, height: 32 });
}

const meanRgb = (path: string) => {
  const { pixels } = readAssetPng(path);
  const total = [0, 0, 0];
  for (let i = 0; i < pixels.length; i += 4) for (let channel = 0; channel < 3; channel++) total[channel] += pixels[i + channel];
  return total.map(value => value / (pixels.length / 4));
};
const luma = ([red, green, blue]: number[]) => red * .2126 + green * .7152 + blue * .0722;
const colorDistance = (left: number[], right: number[]) => Math.hypot(...left.map((value, index) => value - right[index]));
const tilePath = (asset: { source: { kind: "image"; path: string } | null }) => asset.source!.kind === "image" ? asset.source!.path : "";
const grassMean = meanRgb(tilePath(TILE_ASSETS.tile_grass));
const pathMean = meanRgb(tilePath(TILE_ASSETS.tile_path));
assert.ok(grassMean[1] > grassMean[0] && grassMean[1] > grassMean[2], "grass remains warm green");
assert.ok(colorDistance(grassMean, pathMean) > 45, "path remains readable against grass");
const emptyLuma = luma(meanRgb(tilePath(TILE_ASSETS.tile_farm_empty)));
const tilledLuma = luma(meanRgb(tilePath(TILE_ASSETS.tile_farm_tilled)));
const wateredLuma = luma(meanRgb(tilePath(TILE_ASSETS.tile_farm_watered)));
assert.ok(emptyLuma > tilledLuma && tilledLuma > wateredLuma, "empty, tilled and watered soil must separate by moisture/value");
const waterMean = meanRgb(tilePath(TILE_ASSETS.tile_water));
assert.ok(waterMean[2] > waterMean[0] && waterMean[1] > waterMean[0], "water keeps a clear blue-teal identity");

const tree = WORLD_OBJECT_ASSETS.tree;
assert.equal(tree.source.path, `${firstPassRoot}objects/tree.png`);
assert.deepEqual(tree.frameSize, { width: 128, height: 160 });
assert.deepEqual(tree.visualFootprint, { width: 128, height: 160 });
assert.deepEqual(tree.origin, tree.groundAnchor, "tree world position stays on the authored trunk anchor");
assert.deepEqual(tree.defaultCollisionBox, { x: -11, y: -9, width: 22, height: 18 }, "larger crown must not enlarge collision");

const house = WORLD_OBJECT_ASSETS.house;
assert.equal(house.source.path, `${firstPassRoot}objects/farm-house.png`);
assert.deepEqual(house.frameSize, { width: 224, height: 192 });
assert.deepEqual(house.defaultCollisionBox, { x: -96, y: -80, width: 192, height: 135 });
const farmHouse = MAP_DEFINITIONS.farm.objects.find(object => object.id === "house")!;
assert.deepEqual(farmHouse.collision, house.defaultCollisionBox, "map collision remains the Foundation 1.0 checkpoint");
const houseVisualBottom = farmHouse.position.tileY * GAME_CONFIG.tileSize + house.frameSize.height * (1 - house.origin.y);
const houseDoorWarp = MAP_DEFINITIONS.farm.warps.find(warp => warp.id === "house_door")!;
assert.equal(houseVisualBottom, houseDoorWarp.area.startY * GAME_CONFIG.tileSize, "new doorway remains aligned with the existing warp row");

let previousVisiblePixels = 0;
for (const asset of sproutberryStages) {
  assert.equal(asset.source?.kind, "image");
  assert.ok(asset.source?.kind === "image" && asset.source.path.startsWith(`${firstPassRoot}crops/sproutberry-`));
  const png = readAssetPng(asset.source!.path);
  const visiblePixels = png.pixels.filter((_, index) => index % 4 === 3 && png.pixels[index] > 24).length;
  assert.ok(visiblePixels > previousVisiblePixels, `${asset.assetId}: each crop stage must grow visually`);
  previousVisiblePixels = visiblePixels;
}
const mature = readAssetPng(CROP_ASSETS.crop_sproutberry_mature.source!.path);
let ripePixels = 0;
for (let i = 0; i < mature.pixels.length; i += 4) if (mature.pixels[i] > 170 && mature.pixels[i] > mature.pixels[i + 1] * 1.25) ripePixels++;
assert.ok(ripePixels >= 8, "mature sproutberry must show a readable coral-orange harvest signal");

console.log("Graphics First Pass: 12 PNGs, terrain readability, stable collision/warp and four crop stages passed");
