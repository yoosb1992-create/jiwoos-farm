import type { MapRegistry } from "../maps/MapRegistry";
import { FAIRY_FOREST_ID, generateFairyForest } from "./generation";
import { herbObjects, normalizeForestState, type ForestState } from "./resources";

/** Keeps procedural content in the runtime registry, outside authored maps and editor documents. */
export function installFairyForest(registry: MapRegistry, scope: string, daySerial: number, progress?: ForestState) {
  if (!registry.has("road")) return false;
  const maps = registry.snapshot();
  const forest = generateFairyForest(scope, daySerial);
  forest.objects.push(...herbObjects(forest, scope, daySerial));
  const state = normalizeForestState(progress, daySerial, new Set(forest.objects.map(object => object.id)));
  forest.objects = forest.objects.filter(object => !state.depleted.includes(object.id));
  maps[FAIRY_FOREST_ID] = forest;
  if (!maps.road.warps.some(warp => warp.id === "to_fairy_forest")) {
    maps.road.terrainRegions.push({ startX: 13, endX: 20, startY: 6, endY: 7, tileType: "path" });
    maps.road.warps.push({ id: "to_fairy_forest", area: { startX: 19, endX: 20, startY: 6, endY: 7 }, targetMapId: FAIRY_FOREST_ID, targetSpawnId: "entry" });
    maps.road.spawns.push({ id: "forest_return", tileX: 16, tileY: 7, facing: "left" });
    maps.road.objects.push({ id: "forest_gate_tree", assetId: "tree", position: { tileX: 19, tileY: 5.2 }, label: "요정의 숲 ↗", depth: 4 });
  }
  registry.replace(maps);
  return true;
}
