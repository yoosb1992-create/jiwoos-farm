import type { MapRegistry } from "../maps/MapRegistry";
import { ensureRuntimeEntranceAnchors, runtimeEntranceLayout } from "../maps/runtimeEntrances";
import { FAIRY_FOREST_ID } from "./generation";
import { generateResourceForest, normalizeForestState, type ForestState } from "./resources";

/** Keeps procedural content in the runtime registry, outside authored maps and editor documents. */
export function installFairyForest(registry: MapRegistry, scope: string, daySerial: number, progress?: ForestState) {
  if (!registry.has("road")) return false;
  const maps = ensureRuntimeEntranceAnchors(registry.snapshot());
  const forest = generateResourceForest(scope, daySerial);
  const state = normalizeForestState(progress, daySerial, new Set(forest.objects.map(object => object.id)));
  forest.objects = forest.objects.filter(object => !state.depleted.includes(object.id));
  maps[FAIRY_FOREST_ID] = forest;
  const entrance = runtimeEntranceLayout(maps.road, "fairy_forest");
  const warp = { id: "to_fairy_forest", area: entrance.warpArea, targetMapId: FAIRY_FOREST_ID, targetSpawnId: "entry" };
  const warpIndex = maps.road.warps.findIndex((entry) => entry.id === warp.id);
  if (warpIndex >= 0) maps.road.warps[warpIndex] = warp;
  else maps.road.warps.push(warp);
  const spawnIndex = maps.road.spawns.findIndex((entry) => entry.id === entrance.returnSpawn.id);
  if (spawnIndex >= 0) maps.road.spawns[spawnIndex] = entrance.returnSpawn;
  else maps.road.spawns.push(entrance.returnSpawn);
  if (!maps.road.terrainRegions.some((region) =>
    region.tileType === "path" && region.startX === entrance.pathRegion.startX && region.endX === entrance.pathRegion.endX &&
    region.startY === entrance.pathRegion.startY && region.endY === entrance.pathRegion.endY)) {
    maps.road.terrainRegions.push(entrance.pathRegion);
  }
  maps.road.objects = maps.road.objects.filter((object) => object.id !== "forest_gate_tree");
  registry.replace(maps);
  return true;
}
