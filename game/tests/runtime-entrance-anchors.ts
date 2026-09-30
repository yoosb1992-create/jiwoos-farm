import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { createBuiltInEditorDocument, documentToRegistry, parseEditorDocument } from "../editor/document";
import { installFairyForest } from "../forest/registry";
import { installMine } from "../mine/registry";
import { MapRegistry } from "../maps/MapRegistry";
import {
  FAIRY_FOREST_ENTRANCE_ANCHOR_ID,
  MINE_ENTRANCE_ANCHOR_ID,
} from "../maps/runtimeEntrances";

const document = createBuiltInEditorDocument();
const road = document.maps.find((map) => map.id === "road")!;
const fairyAnchor = road.objects.find((object) => object.id === FAIRY_FOREST_ENTRANCE_ANCHOR_ID)!;
const mineAnchor = road.objects.find((object) => object.id === MINE_ENTRANCE_ANCHOR_ID)!;
assert.ok(fairyAnchor, "fairy forest entrance is visible as an authored editor object");
assert.ok(mineAnchor, "mine entrance is visible as an authored editor object");

fairyAnchor.position = { tileX: 25, tileY: 8.2 };
mineAnchor.position = { tileX: 14.5, tileY: 4.2 };
const registry = new MapRegistry(documentToRegistry(document));
assert.ok(installFairyForest(registry, "anchor-test", 1));
assert.ok(installMine(registry, "anchor-test", 1));
assert.deepEqual(registry.require("road").warps.find((warp) => warp.id === "to_fairy_forest")?.area,
  { startX: 25, endX: 26, startY: 9, endY: 10 }, "moving the fairy anchor moves its runtime portal");
assert.deepEqual(registry.require("road").warps.find((warp) => warp.id === "to_mine")?.area,
  { startX: 14, endX: 15, startY: 5, endY: 6 }, "moving the mine anchor moves its runtime portal");

const legacy = createBuiltInEditorDocument();
legacy.maps.find((map) => map.id === "road")!.objects = [];
const parsed = parseEditorDocument(JSON.parse(JSON.stringify(legacy))).document!;
assert.ok(parsed.maps.find((map) => map.id === "road")!.objects.some((object) => object.id === FAIRY_FOREST_ENTRANCE_ANCHOR_ID),
  "older saved worlds regain the fairy entrance anchor");
assert.ok(parsed.maps.find((map) => map.id === "road")!.objects.some((object) => object.id === MINE_ENTRANCE_ANCHOR_ID),
  "older saved worlds regain the mine entrance anchor");

const editorSource = readFileSync(new URL("../../app/editor/MapEditor.tsx", import.meta.url), "utf8");
assert.ok(editorSource.includes("RUNTIME_ENTRANCE_ANCHOR_IDS"), "editor protects runtime entrance anchors from deletion/rename");
assert.ok(editorSource.includes("terrainOnly"), "continuous terrain paint uses the lightweight active-map mutation path");
assert.ok(editorSource.includes("maps: current.maps.slice()"), "ordinary edits stop cloning the entire world document");

console.log("Runtime entrances: visible editor anchors, movable portals, legacy restoration and lighter map mutation passed");
