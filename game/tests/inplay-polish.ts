import { strict as assert } from "node:assert";
import { createHash } from "node:crypto";
import { GAME_CONFIG, START_WITH_HELP_OPEN } from "../config";
import { CHARACTER_VISUAL_PROFILES } from "../assets/definitions";
import { ToolActionSystem } from "../actions/ToolActionSystem";
import {
  PLAYER_ACTION_ASSET,
  TOOL_ACTION_DEFINITIONS,
  TOOL_ACTION_FACINGS,
  TOOL_ACTION_STYLES,
  TOOL_OVERLAY_ASSET,
  WATER_REFILL_ACTION_DEFINITION,
  playerActionAnimationName,
  shouldTriggerToolEffect,
  type ToolActionDefinition,
} from "../actions/toolActionDefinitions";
import { readAssetPng } from "./png";
import type { ToolKey } from "../events";

assert.equal(START_WITH_HELP_OPEN, false, "fresh PC/mobile sessions start with help closed and movement available");
assert.equal(GAME_CONFIG.tileSize, 32, "in-play visuals must not change the logical tile contract");
assert.deepEqual(CHARACTER_VISUAL_PROFILES.adult.interactionAnchor, { x: 24, y: 62.3 }, "lower-body interaction anchor stays unchanged");
assert.deepEqual(CHARACTER_VISUAL_PROFILES.adult.asset.collisionBox, { width: 18, height: 22, offsetX: 15, offsetY: 48 }, "visual actions never enlarge collision");

assert.deepEqual(Object.fromEntries(Object.entries(TOOL_ACTION_DEFINITIONS).map(([tool, definition]) => [tool, definition.style])), {
  hoe: "swing", seed: "reach", water: "pour", hand: "reach", axe: "swing", pickaxe: "swing", fishing_rod: "cast",
});
for (const definition of Object.values(TOOL_ACTION_DEFINITIONS)) {
  assert.equal(definition.effectTiming.trigger, "start", "authoritative gameplay timing stays compatible");
  assert.deepEqual(definition.visualCue, { trigger: "frame", frame: 2 }, "contact VFX is synchronized to the action pose");
}
assert.equal(shouldTriggerToolEffect({ trigger: "start" }, "start"), true);
assert.equal(shouldTriggerToolEffect({ trigger: "frame", frame: 2 }, "frame", 1), false);
assert.equal(shouldTriggerToolEffect({ trigger: "frame", frame: 2 }, "frame", 2), true);
assert.equal(shouldTriggerToolEffect({ trigger: "complete" }, "complete"), true);

const actionSheet = readAssetPng(PLAYER_ACTION_ASSET.source.path);
assert.deepEqual({ width: actionSheet.width, height: actionSheet.height }, { width: 768, height: 288 });
assert.deepEqual(PLAYER_ACTION_ASSET.frameSize, { width: 48, height: 72 });
assert.equal(Object.keys(PLAYER_ACTION_ASSET.animations).length, 20, "five styles × four directions; refill aliases existing body art");
const actionFrameSignature = (frame: number) => {
  const startX = frame % 16 * 48, startY = Math.floor(frame / 16) * 72;
  const hash = createHash("sha256");
  for (let y = 0; y < 72; y++) {
    const offset = ((startY + y) * actionSheet.width + startX) * 4;
    hash.update(actionSheet.pixels.subarray(offset, offset + 48 * 4));
  }
  return hash.digest("hex");
};
for (const style of TOOL_ACTION_STYLES) for (const facing of TOOL_ACTION_FACINGS) {
  const animation = PLAYER_ACTION_ASSET.animations[playerActionAnimationName(style, facing)];
  assert.equal(animation.endFrame - animation.startFrame + 1, 4, `${style}/${facing}: four frames`);
  const signatures = Array.from({ length: 4 }, (_, index) => actionFrameSignature(animation.startFrame + index));
  assert.ok(new Set(signatures).size >= 2, `${style}/${facing}: contains real pose changes`);
}
assert.equal(WATER_REFILL_ACTION_DEFINITION.style, "refill");
assert.equal(WATER_REFILL_ACTION_DEFINITION.effectTiming.trigger, "complete", "refill authority runs after its scoop animation");

const overlays = readAssetPng(TOOL_OVERLAY_ASSET.source.path);
assert.deepEqual({ width: overlays.width, height: overlays.height }, { width: 320, height: 64 });
assert.equal(TOOL_OVERLAY_ASSET.frameCount, 5);
for (let frame = 0; frame < TOOL_OVERLAY_ASSET.frameCount; frame++) {
  let visible = false;
  for (let y = 0; y < 64 && !visible; y++) for (let x = frame * 64; x < (frame + 1) * 64; x++) {
    if (overlays.pixels[(y * overlays.width + x) * 4 + 3] > 100) { visible = true; break; }
  }
  assert.equal(visible, true, `overlay frame ${frame}: visible transparent PNG artwork`);
}
assert.equal(TOOL_ACTION_DEFINITIONS.seed.overlayFrame, undefined);
assert.equal(TOOL_ACTION_DEFINITIONS.hand.overlayFrame, undefined);

let now = 1_000;
let startEffects = 0;
const requests: string[] = [];
const startSystem = new ToolActionSystem({ playAction: ({ tool, style, facing }) => requests.push(`${tool}:${style}:${facing}`) }, () => now);
assert.equal(startSystem.execute("water", "down", () => { startEffects++; }), true);
assert.equal(startEffects, 1, "current gameplay effects still apply immediately");
assert.deepEqual(requests, ["water:pour:down"]);

const frameDefinitions = { ...TOOL_ACTION_DEFINITIONS, hoe: { ...TOOL_ACTION_DEFINITIONS.hoe, effectTiming: { trigger: "frame", frame: 2 } } } as Record<ToolKey, ToolActionDefinition>;
let frameEffects = 0;
now += GAME_CONFIG.toolActionCooldownMs;
const frameSystem = new ToolActionSystem({ playAction: ({ onFrame }) => { onFrame(1); assert.equal(frameEffects, 0); onFrame(2); } }, () => now, frameDefinitions);
frameSystem.execute("hoe", "left", () => { frameEffects++; });
assert.equal(frameEffects, 1, "frame timing is connected to animation callbacks");

const completeDefinitions = { ...TOOL_ACTION_DEFINITIONS, hand: { ...TOOL_ACTION_DEFINITIONS.hand, effectTiming: { trigger: "complete" } } } as Record<ToolKey, ToolActionDefinition>;
let completeEffects = 0;
now += GAME_CONFIG.toolActionCooldownMs;
const completeSystem = new ToolActionSystem({ playAction: ({ onComplete }) => onComplete() }, () => now, completeDefinitions);
completeSystem.execute("hand", "right", () => { completeEffects++; });
assert.equal(completeEffects, 1, "complete timing is connected to animation callbacks");

console.log("In-Play Polish 1: help default, 64 source action frames, refill alias, overlays, styles, timing and anchors passed");
