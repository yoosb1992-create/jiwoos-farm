import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { createBuiltInEditorDocument } from "../editor/document";
import { SCENERY_STAMPS, applySceneryStamp } from "../editor/sceneryStamps";
import { validateEditorDocument } from "../editor/validation";

const decorated = createBuiltInEditorDocument();
const farm = decorated.maps.find((map) => map.id === "farm")!;
const before = farm.objects.length;
for (const stamp of Object.values(SCENERY_STAMPS)) {
  const added = applySceneryStamp(farm, stamp.id, 25, 13);
  assert.ok(added >= 4, `${stamp.id}: scenery stamp places a useful cluster`);
}
assert.ok(farm.objects.length > before + 20, "scenery stamps expand the authored object set");
assert.equal(new Set(farm.objects.map((object) => object.id)).size, farm.objects.length, "scenery stamp ids stay unique");
assert.ok(farm.objects.every((object) => object.position.tileX >= -2 && object.position.tileX <= farm.width + 2 && object.position.tileY >= -2 && object.position.tileY <= farm.height + 2));

const world = createBuiltInEditorDocument();
world.maps.push({
  id: "festival_grove",
  name: "축제 숲",
  width: 36,
  height: 24,
  baseTileType: "grass",
  terrainRegions: [],
  farmAreas: [],
  collisionRegions: [],
  objects: [],
  spawns: [{ id: "entry", tileX: 18, tileY: 12, facing: "down" }],
  warps: [{ id: "back_to_town", area: { startX: 17, endX: 19, startY: 22, endY: 23 }, targetMapId: "town", targetSpawnId: "from_road" }],
  boundary: { enabled: true, openings: [{ startX: 17, endX: 19, startY: 22, endY: 23 }] },
});
world.maps.find((map) => map.id === "town")!.warps.push({
  id: "to_festival_grove",
  area: { startX: 30, endX: 32, startY: 6, endY: 8 },
  targetMapId: "festival_grove",
  targetSpawnId: "entry",
});
assert.deepEqual(validateEditorDocument(world), [], "new maps can be linked into the persistent world document");

const missingCore = createBuiltInEditorDocument();
missingCore.maps = missingCore.maps.filter((map) => map.id !== "town");
assert.ok(validateEditorDocument(missingCore).some((issue) => issue.message.includes("town")), "core NPC/life maps stay protected");

const editorSource = readFileSync(new URL("../../app/editor/MapEditor.tsx", import.meta.url), "utf8");
const pageSource = readFileSync(new URL("../../app/page.tsx", import.meta.url), "utf8");
const stateRouteSource = readFileSync(new URL("../../app/api/family/state/route.ts", import.meta.url), "utf8");
const presetRouteSource = readFileSync(new URL("../../app/api/world-preset/route.ts", import.meta.url), "utf8");

for (const token of ["★ 초기월드로 적용", "초기월드 불러오기", "가로 타일", "세로 타일", "볼거리 묶음"]) {
  assert.ok(editorSource.includes(token), `world editor exposes ${token}`);
}
assert.ok(pageSource.includes("PublishedWorldRepository"), "normal gameplay loads the published initial world");
assert.ok(stateRouteSource.includes("publishedWorldMaps"), "Family authority uses the same published world");
assert.ok(presetRouteSource.includes("world_presets"), "published world is persisted independently from deploy source");

console.log("Persistent world editor: scenery stamps, map linking, sizing UI and published-world runtime contract passed");
