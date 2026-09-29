import { strict as assert } from "node:assert";
import {
  CHARACTER_VISUAL_PROFILES,
  DEFAULT_CHARACTER_VISUAL_PROFILE,
  PLAYER_ANIMATION_NAMES,
  depthFromGroundAnchor,
  displayedSize,
  groundAnchorPoint,
  physicsBoxForScale,
  playerAnimationFrames,
  resolveCharacterVisualProfile,
  WORLD_OBJECT_ASSETS,
} from "../assets/definitions";
import { GRAPHICS_FOUNDATION_ASSET_SET, TERRAIN_GRAPHICS_PROFILE } from "../assets/graphicsFoundation";
import { GAME_CONFIG } from "../config";
import { createBuiltInEditorDocument, parseEditorDocument } from "../editor/document";
import { playerInteractionAnchorFromPosition } from "../player/interaction";

assert.equal(GAME_CONFIG.tileSize, 32, "Graphics Foundation must not change the logical tile size");
assert.deepEqual(Object.keys(GRAPHICS_FOUNDATION_ASSET_SET), [
  "grass", "path", "water", "farmEmpty", "farmTilled", "farmWatered", "tree", "farmHouse", "player", "springCrop",
]);
assert.equal(GRAPHICS_FOUNDATION_ASSET_SET.springCrop.stages.length, 4);
assert.equal(TERRAIN_GRAPHICS_PROFILE.grass.decorationLayer, "terrain-decoration");
assert.equal(TERRAIN_GRAPHICS_PROFILE.water.centerAssetId, "tile_water");

assert.deepEqual(Object.keys(CHARACTER_VISUAL_PROFILES), ["child", "teen", "adult"]);
assert.equal(DEFAULT_CHARACTER_VISUAL_PROFILE.lifeStage, "adult");
assert.equal(resolveCharacterVisualProfile("unknown").lifeStage, "adult", "unknown visual stages must use the current adult default");
for (const [stage, profile] of Object.entries(CHARACTER_VISUAL_PROFILES)) {
  assert.equal(profile.lifeStage, stage);
  assert.equal(profile.asset.frameSize.width, profile.asset.source?.kind === "spritesheet" ? profile.asset.source.frameWidth : 0);
  assert.equal(profile.asset.frameSize.height, profile.asset.source?.kind === "spritesheet" ? profile.asset.source.frameHeight : 0);
  assert.deepEqual(Object.keys(profile.asset.animations), [...PLAYER_ANIMATION_NAMES]);
  assert.equal(new Set(Object.values(profile.asset.animations).flatMap(playerAnimationFrames)).size, 48);
  assert.ok(profile.spriteProfileId && profile.bodyProfileId && profile.hairProfileId && profile.outfitProfileId);
}
assert.notEqual(CHARACTER_VISUAL_PROFILES.child.asset, CHARACTER_VISUAL_PROFILES.adult.asset, "life-stage visual definitions must be independently replaceable");

const tree = WORLD_OBJECT_ASSETS.tree;
const originalCollision = { ...tree.defaultCollisionBox };
const oversizedTree = { ...tree, frameSize: { width: 96, height: 128 }, displayScale: { x: 1.5, y: 1.5 } };
assert.deepEqual(tree.defaultCollisionBox, originalCollision);
assert.deepEqual(oversizedTree.defaultCollisionBox, originalCollision, "visual growth must not expand collision");
assert.deepEqual(displayedSize(oversizedTree), { width: 144, height: 192 });
const treeGround = groundAnchorPoint({ x: 320, y: 240 }, oversizedTree);
assert.ok(treeGround.y > 240, "a tall crown can extend above a lower ground anchor");
assert.ok(depthFromGroundAnchor({ x: 320, y: 240 }, oversizedTree) > 10);

const player = DEFAULT_CHARACTER_VISUAL_PROFILE.asset;
const doubledVisual = { ...player, displayScale: { x: 2, y: 2 } };
const compensated = physicsBoxForScale(player.collisionBox, doubledVisual.displayScale);
assert.equal(compensated.width * doubledVisual.displayScale.x, player.collisionBox.width);
assert.equal(compensated.height * doubledVisual.displayScale.y, player.collisionBox.height);
const anchor = playerInteractionAnchorFromPosition({ x: 100, y: 80 }, { x: 1, y: 1 }, DEFAULT_CHARACTER_VISUAL_PROFILE);
assert.deepEqual(anchor, { x: 100, y: 85.3 }, "authored lower-body interaction anchor must remain stable");

const editor = createBuiltInEditorDocument();
assert.deepEqual(parseEditorDocument(JSON.parse(JSON.stringify(editor))).document, editor, "graphics profiles must not migrate the map editor schema");
assert.equal("lifeStage" in (editor as unknown as Record<string, unknown>), false, "life stage is not persisted in the current editor/save phase");

console.log("Graphics Foundation: 10-role manifest, oversized visuals, life stages, animation contract and editor compatibility passed");
