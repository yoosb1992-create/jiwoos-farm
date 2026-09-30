import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { CAMERA_ZOOM_MAX, CAMERA_ZOOM_MIN, clampCameraZoom, pinchCameraZoom, wheelCameraZoom } from "../input/cameraZoom";
import { MAP_DEFINITIONS } from "../maps/definitions";
import { FOREST_WIDTH } from "../forest/generation";

assert.equal(clampCameraZoom(.2), CAMERA_ZOOM_MIN);
assert.equal(clampCameraZoom(9), CAMERA_ZOOM_MAX);
assert.ok(wheelCameraZoom(1.25, -120) > 1.25, "mouse wheel up zooms in");
assert.ok(wheelCameraZoom(1.25, 120) < 1.25, "mouse wheel down zooms out");
assert.equal(pinchCameraZoom(1, 100, 150), 1.5, "pinch spread zooms in");
assert.equal(pinchCameraZoom(1.5, 100, 50), .75, "pinch close zooms out and clamps");

assert.deepEqual([MAP_DEFINITIONS.farm.width, MAP_DEFINITIONS.farm.height], [52, 26]);
assert.deepEqual([MAP_DEFINITIONS.farmhouse.width, MAP_DEFINITIONS.farmhouse.height], [22, 13]);
assert.deepEqual([MAP_DEFINITIONS.road.width, MAP_DEFINITIONS.road.height], [30, 14]);
assert.deepEqual([MAP_DEFINITIONS.town.width, MAP_DEFINITIONS.town.height], [44, 18]);
assert.deepEqual([MAP_DEFINITIONS.general_store.width, MAP_DEFINITIONS.general_store.height], [22, 13]);
assert.equal(FOREST_WIDTH, 40);

const gameSource=readFileSync(new URL("../createGame.ts",import.meta.url),"utf8");
const sceneSource=readFileSync(new URL("../FarmScene.ts",import.meta.url),"utf8");
assert.ok(gameSource.includes("activePointers: 3"), "Phaser keeps enough pointers for joystick/action/pinch");
assert.ok(sceneSource.includes('this.input.on("wheel"'), "PC wheel zoom is connected");
assert.ok(sceneSource.includes("pinchCameraZoom"), "mobile pinch zoom is connected");
assert.ok(sceneSource.includes("pointer.downElement ?? pointer.event?.target"), "scene pointerdown uses Phaser Pointer DOM source instead of a nonexistent callback event argument");
assert.ok(!sceneSource.includes("_currentlyOver: Phaser.GameObjects.GameObject[], event: Event"), "scene pointerdown does not expect a third native event argument");
assert.ok(sceneSource.includes("queueTouchNavigation"), "mobile tap can create navigation");
assert.ok(sceneSource.includes("touchNavigationMovement"), "tap navigation feeds movement");
assert.ok(sceneSource.includes("performContextualTouchAction"), "tap action resolves after approach");
assert.ok(sceneSource.includes(">22"), "mobile taps tolerate normal finger jitter");
assert.ok(sceneSource.includes("deferredTouchAction"), "Family contextual touch is queued instead of dropped while syncing");
assert.ok(sceneSource.includes("deferredMobileAction"), "mobile action-button presses are queued during Family sync");
for (const token of ["openMachineAt", "openRanchAt", "tappedNpc", "contextualTouchTool"]) {
  assert.ok(sceneSource.includes(token), `${token} participates in contextual touch action`);
}
for (const tool of ['return "hoe"','return "seed"','return "water"','return "hand"','return "axe"','return "pickaxe"']) {
  assert.ok(sceneSource.includes(tool), `${tool}: mobile farm/resource context chooses a tool`);
}

console.log("World scale/touch camera: expanded maps, wheel+pinch zoom, tap navigation and contextual actions passed");
