import type { MapRegistry } from "../maps/MapRegistry";
import { generateMineFloor, MINE_PLAYABLE_FLOORS, mineMapId } from "./generation";
import { mineResourceKind, normalizeMineDaily } from "./resources";
import type { MineDailyState } from "./types";

/** Add the mine to the runtime registry without changing authored/editor maps. */
export function installMine(registry: MapRegistry, scope: string, daySerial: number, daily?: MineDailyState) {
  if (!registry.has("road")) return false;
  const maps = registry.snapshot(), state = normalizeMineDaily(daily, daySerial, scope);
  if (!maps.road.warps.some(w => w.id === "to_mine")) {
    // The road's west bank has water through x=4; x=6..8,y=6..7 is clear grass.
    maps.road.terrainRegions.push({ startX: 6, endX: 8, startY: 6, endY: 7, tileType: "path" });
    maps.road.warps.push({ id: "to_mine", area: { startX: 6, endX: 7, startY: 6, endY: 7 }, targetMapId: mineMapId(1), targetSpawnId: "entry" });
    maps.road.spawns.push({ id: "mine_return", tileX: 8.5, tileY: 7, facing: "right" });
    maps.road.objects.push({ id: "mine_gate", assetId: "mine_entrance", position: { tileX: 6.5, tileY: 5.2 }, label: "광산 ↖", depth: 4 });
  }
  for (let floor = 1; floor <= MINE_PLAYABLE_FLOORS; floor++) {
    const map = generateMineFloor(scope, daySerial, floor), depleted = state.floors[floor]?.depleted ?? [];
    map.objects = map.objects.filter(o => !mineResourceKind(o) || !depleted.includes(o.id));
    maps[mineMapId(floor)] = map;
  }
  registry.replace(maps);
  return true;
}
