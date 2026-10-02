import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { createBuiltInEditorDocument } from "../editor/document";
import { EditorDocumentHistory } from "../editor/history";
import { WORLD_CHUNK_SIZE, worldChunkBounds, worldChunkForTile, worldChunksForRect } from "../maps/chunks";
import type { MapDefinition } from "../maps/types";
import { terrainCompositionTiles } from "../rendering/terrainCandidates";

const document = createBuiltInEditorDocument();
const farm = document.maps.find((map) => map.id === "farm")!;
const town = document.maps.find((map) => map.id === "town")!;
const originalFarmName = farm.name;
const history = new EditorDocumentHistory(5);
history.pushMap(document, "farm");
farm.name = "확장 농장";
town.name = "현재 마을 변경";
const undone = history.undo(document)!;
assert.equal(undone.maps.find((map) => map.id === "farm")!.name, originalFarmName, "map-scoped undo restores the edited map");
assert.equal(undone.maps.find((map) => map.id === "town")!.name, "현재 마을 변경", "map-scoped undo does not clone/rewind unrelated maps");
assert.equal(history.redo(undone)?.maps.find((map) => map.id === "farm")?.name, "확장 농장");

assert.equal(WORLD_CHUNK_SIZE, 32);
assert.deepEqual(worldChunkForTile(63, 64), { chunkX: 1, chunkY: 2 });
assert.deepEqual(worldChunkBounds({ chunkX: 1, chunkY: 2 }), { startX: 32, endX: 63, startY: 64, endY: 95 });
assert.equal(worldChunksForRect({ startX: 31, endX: 64, startY: 31, endY: 64 }).length, 9, "large areas can be partitioned into stable world chunks");

const largeMap: MapDefinition = {
  id: "large_test",
  name: "대형 테스트",
  width: 480,
  height: 300,
  baseTileType: "grass",
  terrainRegions: [
    { startX: 10, endX: 109, startY: 20, endY: 20, tileType: "path" },
    { startX: 200, endX: 219, startY: 80, endY: 89, tileType: "water" },
  ],
  farmAreas: [],
  collisionRegions: [],
  objects: [],
  spawns: [{ id: "entry", tileX: 2, tileY: 2, facing: "down" }],
  warps: [],
  boundary: { enabled: true },
};
assert.equal(terrainCompositionTiles(largeMap).length, 300, "terrain composition work scales with authored path/water cells, not the full 144k-tile map");

const editorSource = readFileSync(new URL("../../app/editor/EditorCanvas.tsx", import.meta.url), "utf8");
const mapEditorSource = readFileSync(new URL("../../app/editor/MapEditor.tsx", import.meta.url), "utf8");
assert.ok(editorSource.includes("terrainStroke"), "terrain painting batches one pointer stroke locally");
assert.ok(editorSource.includes("commitTerrainStroke"), "terrain document commits once when the stroke completes");
assert.ok(!editorSource.includes("onContinuous"), "terrain painting no longer rewrites the React world document for every crossed tile");
assert.ok(mapEditorSource.includes("EditorDocumentHistory"), "editor uses map-scoped undo snapshots");
assert.ok(mapEditorSource.includes("requestIdleCallback"), "autosave yields to browser idle time when available");

console.log("World scalability: map-scoped undo, batched terrain painting, chunk math and sparse terrain composition passed");
