import { strict as assert } from "node:assert";
import { createHash } from "node:crypto";
import {
  CHARACTER_VISUAL_PROFILES,
  PLAYER_ANIMATION_NAMES,
  WORLD_OBJECT_ASSETS,
  playerAnimationFrames,
} from "../assets/definitions";
import { GAME_CONFIG } from "../config";
import { MAP_DEFINITIONS } from "../maps/definitions";
import { playerFeetPointFromPosition, playerInteractionAnchorFromPosition } from "../player/interaction";
import { readAssetPng } from "./png";

const objectIds = [
  "fence_horizontal", "fence_vertical", "fence_corner", "gate",
  "flowering_bush", "green_shrub", "flower_bed", "mailbox",
  "bench", "rustic_lamp", "stone_well", "tree_variant_a",
  "tree_variant_b", "pond_rock_large", "stump", "farm_crate",
] as const;

for (const id of objectIds) {
  const asset = WORLD_OBJECT_ASSETS[id];
  assert.equal(asset.source.kind, "image");
  assert.ok(asset.source.path.startsWith("/assets/graphics-vertical-slice/objects/"));
  const png = readAssetPng(asset.source.path);
  assert.deepEqual({ width: png.width, height: png.height }, asset.frameSize, `${id}: PNG dimensions match metadata`);
  const alpha = (x: number, y: number) => png.pixels[(y * png.width + x) * 4 + 3];
  assert.equal(alpha(0, 0), 0, `${id}: transparent outer canvas`);
  assert.ok(png.pixels.some((value, index) => index % 4 === 3 && value > 200), `${id}: visible artwork exists`);
}

const adult = CHARACTER_VISUAL_PROFILES.adult;
assert.equal(adult.spriteProfileId, "adult-farmer-v1");
assert.equal(adult.asset.source?.kind, "spritesheet");
assert.equal(adult.asset.source?.path, "/assets/graphics-vertical-slice/player/adult-farmer-48.png");
assert.deepEqual(adult.asset.frameSize, { width: 48, height: 72 });
assert.deepEqual(adult.asset.collisionBox, { width: 18, height: 22, offsetX: 15, offsetY: 48 });
assert.deepEqual(adult.interactionAnchor, { x: 24, y: 62.3 });
assert.equal(GAME_CONFIG.tileSize, 32, "larger adult frames never change the logical tile");

const sheet = readAssetPng(adult.asset.source!.path);
assert.deepEqual({ width: sheet.width, height: sheet.height }, { width: 768, height: 216 });
const frameSignature = (frame: number) => {
  const startX = frame % 16 * 48, startY = Math.floor(frame / 16) * 72;
  const hash = createHash("sha256");
  for (let y = 0; y < 72; y++) {
    const offset = ((startY + y) * sheet.width + startX) * 4;
    hash.update(sheet.pixels.subarray(offset, offset + 48 * 4));
  }
  return hash.digest("hex");
};
assert.equal(new Set(Object.values(adult.asset.animations).flatMap(playerAnimationFrames)).size, 48);
assert.deepEqual(Object.keys(adult.asset.animations), [...PLAYER_ANIMATION_NAMES]);
for (const name of PLAYER_ANIMATION_NAMES) {
  const signatures = playerAnimationFrames(adult.asset.animations[name]).map(frameSignature);
  assert.equal(signatures.length, 4, `${name}: four frames`);
  assert.ok(new Set(signatures).size >= 2, `${name}: animation contains real visual change`);
}

const position = { x: 320, y: 323 };
assert.deepEqual(playerFeetPointFromPosition(position, { x: 1, y: 1 }, adult), { x: 320, y: 336 }, "adult feet preserve the previous +13px world contract");
const interaction = playerInteractionAnchorFromPosition(position, { x: 1, y: 1 }, adult);
assert.ok(Math.abs(interaction.x - 320) < 1e-9 && Math.abs(interaction.y - 328.3) < 1e-9, "lower-body interaction anchor preserves the previous +5.3px contract");
assert.ok(Math.abs(adult.asset.frameSize.height * (adult.asset.groundAnchor!.y - adult.asset.origin.y) - 13) < 1e-9, "ground anchor is the two-foot contact point");

const farm = MAP_DEFINITIONS.farm;
const used = new Set(farm.objects.map(object => object.assetId));
for (const id of objectIds) assert.ok(used.has(id), `${id}: authored into the vertical-slice farm`);
assert.deepEqual([farm.width, farm.height], [52, 26]);
assert.deepEqual(farm.farmAreas, [{ startX: 9, endX: 18, startY: 8, endY: 14 }]);
assert.deepEqual(farm.collisionRegions, [{ startX: 24, endX: 30, startY: 15, endY: 20 }]);
assert.deepEqual(farm.warps.find(warp => warp.id === "house_door")?.area, { startX: 4, endX: 6, startY: 8, endY: 9 });
assert.deepEqual(farm.warps.find(warp => warp.id === "exit_south")?.area, { startX: 19, endX: 22, startY: 24, endY: 25 });

assert.equal(CHARACTER_VISUAL_PROFILES.child.asset.source?.path, "/assets/player/player-main.png");
assert.equal(CHARACTER_VISUAL_PROFILES.teen.asset.source?.path, "/assets/player/player-main.png");
assert.notEqual(CHARACTER_VISUAL_PROFILES.child.asset, adult.asset);
assert.notEqual(CHARACTER_VISUAL_PROFILES.teen.asset, adult.asset);

console.log("Graphics 1.4 vertical slice: 16 object PNGs, adult 48 frames, anchors and authored farm dressing passed");
