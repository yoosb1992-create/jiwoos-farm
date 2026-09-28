import { strict as assert } from "node:assert";
import { FOREST_ENTRY, generateFairyForest, forestReachable, forestSeed, safeForestPosition, recoverForestPosition } from "../forest/generation";
import { installFairyForest } from "../forest/registry";
import { normalizeSaveData } from "../domain";
import { parseFamilyPose } from "../family/personal";
import { FamilyClient } from "../family/client";
import { MapRegistry } from "../maps/MapRegistry";
import { MAP_DEFINITIONS } from "../maps/definitions";
import { GAME_CONFIG } from "../config";

const first = generateFairyForest("family-room-a", 5);
assert.deepEqual(first, generateFairyForest("family-room-a", 5), "same room and day yield identical forest on independent clients");
assert.notDeepEqual(first.objects, generateFairyForest("family-room-a", 6).objects, "new day changes layout");
assert.notDeepEqual(first.objects, generateFairyForest("family-room-b", 5).objects, "family rooms have independent layouts");
assert.equal(forestSeed("single", 5), forestSeed("single", 5));
for (let day = 1; day <= 100; day++) {
  const map = generateFairyForest("family-room-a", day);
  assert.ok(map.objects.some(o => o.assetId === "tree"));
  assert.ok(map.objects.some(o => o.assetId === "forest_rock"));
  assert.ok(safeForestPosition(map, FOREST_ENTRY.tileX * GAME_CONFIG.tileSize, FOREST_ENTRY.tileY * GAME_CONFIG.tileSize));
  for (const target of [{x:15,y:22}, {x:15,y:10}, {x:6,y:6}, {x:25,y:7}]) assert.ok(forestReachable(map, {x:15,y:20}, target), `day ${day} clearing accessible`);
}
const registry = new MapRegistry();
assert.ok(installFairyForest(registry, "single", 3));
assert.equal(registry.require("fairy_forest").id, "fairy_forest");
assert.notEqual(JSON.stringify(registry.require("road")), JSON.stringify(MAP_DEFINITIONS.road), "runtime entrance is present");
assert.equal(MAP_DEFINITIONS.road.warps.length, 2, "authored road remains untouched");
assert.equal(registry.require("road").warps.find(w => w.id === "to_fairy_forest")?.targetMapId, "fairy_forest");
assert.equal(registry.require("fairy_forest").warps[0].targetSpawnId, "forest_return");
assert.ok(!registry.require("road").warps.some(w => w.id === "to_fairy_forest" && w.area.startX <= 16), "return spawn cannot immediately warp back");
installFairyForest(registry, "single", 4);
assert.equal(registry.require("road").warps.filter(w => w.id === "to_fairy_forest").length, 1, "day changes cannot duplicate the entrance");
const previous = generateFairyForest("single", 3), tomorrow = registry.require("fairy_forest");
let oldPosition: { x: number; y: number } | undefined;
for (let y = 2; y < 22 && !oldPosition; y++) for (let x = 2; x < 30; x++) {
  const p = { x: (x + .5) * GAME_CONFIG.tileSize, y: (y + .5) * GAME_CONFIG.tileSize };
  if (safeForestPosition(previous, p.x, p.y) && !safeForestPosition(tomorrow, p.x, p.y)) { oldPosition = p; break; }
}
assert.ok(oldPosition, "a day change can put the previous position inside an obstacle");
assert.deepEqual(recoverForestPosition(tomorrow, oldPosition), { x: FOREST_ENTRY.tileX * 32, y: FOREST_ENTRY.tileY * 32 });
const valid = { x: FOREST_ENTRY.tileX * 32, y: FOREST_ENTRY.tileY * 32 };
assert.deepEqual(recoverForestPosition(tomorrow, valid), valid, "same-day safe position is retained");
assert.equal(normalizeSaveData({ version: 4, day: 3, daySerial: 31, player: { mapId: "fairy_forest", ...valid, facing: "up" } })?.player.mapId, "fairy_forest", "local save restores forest map without schema changes");
const pose = { mapId: "fairy_forest", ...valid, facing: "up", selectedTool: "hand", moving: false } as const;
assert.deepEqual(parseFamilyPose(pose), pose, "presence accepts the procedural map");
assert.equal(parseFamilyPose({ ...pose, x: -5 }), null);
if (typeof localStorage !== "undefined") {
  const client = new FamilyClient({room:{id:"forest-room",playerId:"forest-player",nickname:"가족",name:"숲",inviteCode:"ABCDEFGH"}},()=>{},()=>{});
  client.savePersonal(pose, 31);
  assert.deepEqual(client.loadPersonal(), { ...pose, forestDaySerial:31 }, "family reconnection retains forest day and pose");
}
console.log("Fairy forest: seeded layouts, clearings, entrance, safe spawn and registry isolation passed");
