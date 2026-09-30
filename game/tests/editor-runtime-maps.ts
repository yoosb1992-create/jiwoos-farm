import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { createBuiltInEditorDocument, documentToRegistry } from "../editor/document";
import { installFairyForest } from "../forest/registry";
import { FAIRY_FOREST_ID } from "../forest/generation";
import { installMine } from "../mine/registry";
import { mineMapId, MINE_PLAYABLE_FLOORS } from "../mine/generation";
import { MapRegistry } from "../maps/MapRegistry";

const registry = new MapRegistry(documentToRegistry(createBuiltInEditorDocument()));
assert.ok(installFairyForest(registry, "editor-test", 1));
assert.ok(installMine(registry, "editor-test", 1));
assert.ok(registry.has(FAIRY_FOREST_ID), "editor-authored world receives the procedural fairy forest at runtime");
for (let floor = 1; floor <= MINE_PLAYABLE_FLOORS; floor++) assert.ok(registry.has(mineMapId(floor)), `editor-authored world receives mine floor ${floor}`);
assert.ok(registry.require("road").warps.some((warp) => warp.targetMapId === FAIRY_FOREST_ID), "road links to fairy forest during test play");
assert.ok(registry.require("road").warps.some((warp) => warp.targetMapId === mineMapId(1)), "road links to mine during test play");

const sceneSource = readFileSync(new URL("../FarmScene.ts", import.meta.url), "utf8");
assert.ok(!sceneSource.includes("if (this.testMode || (!force && this.forestDayInstalled"), "test mode no longer blocks fairy forest installation");
assert.ok(!sceneSource.includes("if (this.testMode || (!force && this.mineDayInstalled"), "test mode no longer blocks mine installation");
assert.ok(sceneSource.includes("this.syncForest();\n    this.syncMine();"), "scene creation installs procedural runtime maps for editor test play");
console.log("Editor test play: fairy forest and all mine floors remain connected");
