import { strict as assert } from "node:assert";
import { FOREST_ENTRY, generateFairyForest, forestReachable, forestSeed, safeForestPosition } from "../forest/generation";
import { installFairyForest } from "../forest/registry";
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
assert.equal(JSON.stringify(registry.require("road")), JSON.stringify(MAP_DEFINITIONS.road), "authored road map remains untouched");
console.log("Fairy forest: seeded layouts, clearings, entrance, safe spawn and registry isolation passed");
