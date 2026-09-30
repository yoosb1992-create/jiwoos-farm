import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { GAME_CONFIG } from "../config";
import { TERRAIN_GRAPHICS_PROFILE } from "../assets/graphicsFoundation";
import { FARM_TERRAIN_DECORATIONS, TERRAIN_COMPOSITION_ASSETS } from "../assets/terrainComposition";
import { TILE_ASSETS, WORLD_OBJECT_ASSETS } from "../assets/definitions";
import { MAP_DEFINITIONS } from "../maps/definitions";
import { readAssetPng } from "./png";

assert.equal(GAME_CONFIG.tileSize, 32, "composition must not change the logical tile");
assert.equal(TILE_ASSETS.tile_grass.source?.kind, "image");
const grass = readAssetPng(TILE_ASSETS.tile_grass.source!.path);
const previousGrass = readAssetPng("/assets/graphics-first-pass/tiles/grass.png");
assert.deepEqual([grass.width, grass.height], [128, 128]);
const variation = (pixels: Buffer) => {
  const values = Array.from({ length: pixels.length / 4 }, (_, index) => {
    const offset = index * 4;
    return pixels[offset] * .2126 + pixels[offset + 1] * .7152 + pixels[offset + 2] * .0722;
  });
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length);
};
assert.ok(variation(grass.pixels) < variation(previousGrass.pixels), "base grass noise must be quieter than First Pass");

for (let y = 0; y < grass.height; y++) {
  const left = grass.pixels.subarray(y * grass.width * 4, y * grass.width * 4 + 4);
  const right = grass.pixels.subarray((y * grass.width + grass.width - 1) * 4, (y * grass.width + grass.width) * 4);
  assert.deepEqual(left, right, "grass horizontal repeat seam");
}
for (let x = 0; x < grass.width; x++) {
  assert.deepEqual(grass.pixels.subarray(x * 4, x * 4 + 4), grass.pixels.subarray(((grass.height - 1) * grass.width + x) * 4, ((grass.height - 1) * grass.width + x) * 4 + 4), "grass vertical repeat seam");
}

const required = [
  ...Object.values(TERRAIN_GRAPHICS_PROFILE.path.edgeAssetIds),
  ...Object.values(TERRAIN_GRAPHICS_PROFILE.path.outerCornerAssetIds),
  ...Object.values(TERRAIN_GRAPHICS_PROFILE.path.innerCornerAssetIds),
  ...Object.values(TERRAIN_GRAPHICS_PROFILE.farm.borderAssetIds),
  ...Object.values(TERRAIN_GRAPHICS_PROFILE.farm.cornerAssetIds),
  ...Object.values(TERRAIN_GRAPHICS_PROFILE.water.edgeAssetIds),
  ...Object.values(TERRAIN_GRAPHICS_PROFILE.water.cornerAssetIds),
  ...TERRAIN_GRAPHICS_PROFILE.grass.decorationAssetIds,
  ...TERRAIN_GRAPHICS_PROFILE.water.decorationAssetIds,
];
assert.equal(new Set(required).size, required.length, "composition roles should have independent asset ids");
for (const assetId of required) {
  const asset = TERRAIN_COMPOSITION_ASSETS[assetId];
  const png = readAssetPng(asset.source!.path);
  assert.deepEqual([png.width, png.height], [asset.frameSize.width, asset.frameSize.height], assetId);
  const alpha = png.pixels.filter((_, index) => index % 4 === 3);
  assert.ok(alpha.some(value => value === 0) && alpha.some(value => value > 0), `${assetId}: transparent visual overlay`);
}
assert.ok(FARM_TERRAIN_DECORATIONS.length >= 12);

const farm = MAP_DEFINITIONS.farm;
assert.deepEqual(farm.farmAreas, [{ startX: 9, endX: 18, startY: 8, endY: 14 }], "farmable geometry remains unchanged");
assert.deepEqual(farm.collisionRegions, [{ startX: 24, endX: 30, startY: 15, endY: 20 }], "pond collision remains unchanged");
assert.deepEqual(farm.objects.find(object => object.id === "house")?.collision, WORLD_OBJECT_ASSETS.house.defaultCollisionBox, "house collision remains unchanged");
assert.deepEqual(farm.warps.find(warp => warp.id === "house_door")?.area, { startX: 4, endX: 6, startY: 8, endY: 9 }, "house warp remains unchanged");

const page = readFileSync(new URL("../../app/page.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");
const scene = readFileSync(new URL("../FarmScene.ts", import.meta.url), "utf8");
for (const contract of ["mobile-menu-backdrop", "aria-modal", "menu-open"]) assert.ok(page.includes(contract), contract);
for (const contract of ["z-index:72", "overflow-y:auto", "overscroll-behavior:contain", "-webkit-overflow-scrolling:touch", "safe-area-inset-bottom", "scrollbar-width:thin", ".mobile-menu-open .custom-mobile-control", ".mobile-menu-open .quickbar"]) assert.ok(css.includes(contract), contract);
assert.ok(scene.includes("menuInputBlocked") && scene.includes("this.menuInputBlocked ||"), "menu blocks Phaser movement and action input");

console.log("Graphics 1.2 composition: quiet seamless grass, path/farm/pond borders, sparse decorations and mobile menu input contract passed");
