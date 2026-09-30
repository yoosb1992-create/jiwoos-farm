import { strict as assert } from "node:assert";
import { appendTerrainPaintCell, editorGridStep } from "../editor/terrainPaint";
import type { MapDefinition } from "../maps/types";

const regions: MapDefinition["terrainRegions"] = [];
for (let x = 0; x < 200; x++) appendTerrainPaintCell(regions, "path", x, 4);
assert.equal(regions.length, 1, "continuous horizontal terrain paint compacts into one region");
assert.deepEqual(regions[0], { startX: 0, endX: 199, startY: 4, endY: 4, tileType: "path" });
assert.equal(appendTerrainPaintCell(regions, "path", 100, 4), false, "repainting inside the current run is ignored");
assert.equal(editorGridStep(400, 200), 1, "80k tile map keeps one-tile grid");
assert.ok(Math.ceil(50_000 / editorGridStep(50_000, 8)) < 710, "extremely long maps cap rendered grid lines");
console.log("Editor stability: terrain paint compaction and adaptive large-map grid passed");
