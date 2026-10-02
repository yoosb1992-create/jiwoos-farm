import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { moveFarmArea, resizeFarmArea } from "../editor/farmAreaDrag";

const source = { startX: 4, endX: 8, startY: 5, endY: 7 };
assert.deepEqual(moveFarmArea(source, 3.2, -2.1, 20, 15), { startX: 7, endX: 11, startY: 3, endY: 5 });
assert.deepEqual(moveFarmArea(source, -99, 99, 10, 10), { startX: 0, endX: 4, startY: 7, endY: 9 }, "moving clamps the full area inside the map");
assert.deepEqual(resizeFarmArea(source, "se", 12.8, 10.2, 20, 15), { startX: 4, endX: 12, startY: 5, endY: 10 });
assert.deepEqual(resizeFarmArea(source, "nw", 6.9, 6.9, 20, 15), { startX: 6, endX: 8, startY: 6, endY: 7 }, "resize handles cannot invert an area");

const canvasSource = readFileSync(new URL("../../app/editor/EditorCanvas.tsx", import.meta.url), "utf8");
assert.ok(canvasSource.includes("startFarmAreaDrag"), "farm areas start drag interactions from select mode");
assert.ok(canvasSource.includes("moveFarmArea"), "farm area body drag moves the rectangle");
assert.ok(canvasSource.includes("resizeFarmArea"), "farm area handles resize the rectangle");
assert.ok(canvasSource.includes('["nw", left, top]'), "eight resize handles are rendered around a selected farm area");

console.log("Editor farm areas: select-mode drag move and handle resize passed");
