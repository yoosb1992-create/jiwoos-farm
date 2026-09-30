import type { MapRegistry } from "../maps/MapRegistry";
import { ensureRuntimeEntranceAnchors, runtimeEntranceLayout } from "../maps/runtimeEntrances";
import { generateMineFloor, MINE_PLAYABLE_FLOORS, mineMapId } from "./generation";
import { mineResourceKind, normalizeMineDaily } from "./resources";
import type { MineDailyState } from "./types";

/** Add the mine to the runtime registry without changing authored/editor maps. */
export function installMine(registry: MapRegistry, scope: string, daySerial: number, daily?: MineDailyState) {
  if (!registry.has("road")) return false;
  const maps = ensureRuntimeEntranceAnchors(registry.snapshot()), state = normalizeMineDaily(daily, daySerial, scope);
  const entrance = runtimeEntranceLayout(maps.road, "mine");
  const warp = { id: "to_mine", area: entrance.warpArea, targetMapId: mineMapId(1), targetSpawnId: "entry" };
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
  maps.road.objects = maps.road.objects.filter((object) => object.id !== "mine_gate");
  for (let floor = 1; floor <= MINE_PLAYABLE_FLOORS; floor++) {
    const map = generateMineFloor(scope, daySerial, floor), depleted = state.floors[floor]?.depleted ?? [];
    map.objects = map.objects.filter(o => !mineResourceKind(o) || !depleted.includes(o.id));
    maps[mineMapId(floor)] = map;
  }
  registry.replace(maps);
  return true;
}
