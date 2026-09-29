import { GAME_CONFIG } from "../config";
import { safeForestPosition } from "../forest/generation";
import type { MapDefinition, MapObjectDefinition, TileRect } from "../maps/types";

export const MINE_PLAYABLE_FLOORS = 5;
export const MINE_WIDTH = 24;
export const MINE_HEIGHT = 18;
export const mineMapId = (floor: number) => `mine_floor_${floor}`;
export function mineFloorFromMapId(id: unknown): number | null {
  if (typeof id !== "string" || !/^mine_floor_[1-9]\d*$/.test(id)) return null;
  const floor = Number(id.slice(11));
  return Number.isSafeInteger(floor) && floor <= MINE_PLAYABLE_FLOORS ? floor : null;
}
export const MINE_ENTRY = { tileX: 11.5, tileY: 14.5, facing: "up" as const };
export function recoverMinePosition(map: MapDefinition, position: { x: number; y: number } | undefined) {
  if (position && safeForestPosition(map, position.x, position.y)) return position;
  return { x: MINE_ENTRY.tileX * GAME_CONFIG.tileSize, y: MINE_ENTRY.tileY * GAME_CONFIG.tileSize };
}
const area = (startX: number, endX: number, startY: number, endY: number): TileRect => ({ startX, endX, startY, endY });

export function mineFloorSeed(scope: string, daySerial: number, floor: number) {
  if (!Number.isSafeInteger(daySerial) || daySerial < 1 || !Number.isSafeInteger(floor) || floor < 1 || floor > MINE_PLAYABLE_FLOORS) throw new Error("Invalid mine floor or day");
  let hash = 2166136261;
  for (const c of `jiwoos-farm:mine:v1:${scope}:${daySerial}:${floor}`) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619);
  return hash >>> 0;
}

/** Open central corridor, small side wall clusters, and a fixed breakable stair stone.
 * All resource objects are passable: daily variation cannot seal the entrance or stairs. */
export function generateMineFloor(scope: string, daySerial: number, floor: number): MapDefinition {
  let seed = mineFloorSeed(scope, daySerial, floor) || 1;
  const next = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed >>> 0; };
  const collisionRegions: TileRect[] = [area(0, 23, 0, 0), area(0, 23, 17, 17), area(0, 0, 1, 16), area(23, 23, 1, 16)];
  const wallX = 3 + next() % 3, wallY = 3 + next() % 3;
  const wallX2 = 18 + next() % 3, wallY2 = 10 + next() % 3;
  collisionRegions.push(area(wallX, wallX + 1, wallY, wallY + 1), area(wallX2, wallX2 + 1, wallY2, wallY2 + 1));
  const blocked = (x: number, y: number) => collisionRegions.some(r => x >= r.startX && x <= r.endX && y >= r.startY && y <= r.endY);
  const used = new Set(["12,5"]);
  const objects: MapObjectDefinition[] = [
    { id: "stair-stone-12-5", assetId: "mine_stone", position: { tileX: 12.5, tileY: 5.5 }, label: "사다리 바위", depth: 4 },
    { id: "mine_stairs", assetId: "mine_ladder", position: { tileX: 12, tileY: 2.5 }, label: floor === MINE_PLAYABLE_FLOORS ? "아래층은 아직 막혀 있어요" : "다음 층", depth: 2 },
  ];
  const place = (kind: "stone" | "copper", count: number) => {
    for (let i = 0; i < count;) {
      const x = 2 + next() % 20, y = 3 + next() % 13;
      if (blocked(x, y) || used.has(`${x},${y}`) || (x >= 10 && x <= 13 && (y >= 12 || y <= 6))) continue;
      used.add(`${x},${y}`);
      objects.push({ id: `${kind}-${x}-${y}`, assetId: kind === "stone" ? "mine_stone" : "mine_copper", position: { tileX: x + .5, tileY: y + .5 }, depth: 3 });
      i++;
    }
  };
  place("stone", 6); place("copper", 4);
  const map: MapDefinition = {
    id: mineMapId(floor), name: `광산 ${floor}층`, width: MINE_WIDTH, height: MINE_HEIGHT, baseTileType: "mine_floor",
    terrainRegions: collisionRegions.map(r => ({ ...r, tileType: "mine_wall" })), collisionRegions, farmAreas: [], objects,
    spawns: [{ id: "entry", ...MINE_ENTRY }, { id: "near_ladder", tileX: 11.5, tileY: 4.5, facing: "up" }],
    warps: [
      { id: "mine_exit", area: area(10, 13, 16, 16), targetMapId: floor === 1 ? "road" : mineMapId(floor - 1), targetSpawnId: floor === 1 ? "mine_return" : "near_ladder" },
      { id: "mine_down", area: area(11, 12, 2, 3), targetMapId: mineMapId(floor + 1), targetSpawnId: "entry" },
    ], boundary: { enabled: true },
  };
  for (const spawn of map.spawns) if (!safeForestPosition(map, spawn.tileX * GAME_CONFIG.tileSize, spawn.tileY * GAME_CONFIG.tileSize)) throw new Error("Blocked mine spawn");
  return map;
}
