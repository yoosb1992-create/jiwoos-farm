import { GAME_CONFIG } from "../config";
import { PLAYER_ASSET } from "../assets/definitions";
import { TILE_TYPE_DEFINITIONS, getTileTypeInMap } from "../maps/definitions";
import type { MapDefinition, MapObjectDefinition, TileRect } from "../maps/types";

export const FAIRY_FOREST_ID = "fairy_forest";
export const FOREST_WIDTH = 32;
export const FOREST_HEIGHT = 24;
export const FOREST_ENTRY = { tileX: 15.5, tileY: 20.5, facing: "up" as const };
const area = (startX: number, endX: number, startY: number, endY: number): TileRect => ({ startX, endX, startY, endY });
const key = (x: number, y: number) => `${x},${y}`;

/** Pure, stable integer hash; neither browser random state nor server clock affects the layout. */
export function forestSeed(scope: string, daySerial: number): number {
  if (!Number.isSafeInteger(daySerial) || daySerial < 1) throw new Error("Invalid forest daySerial");
  let hash = 2166136261;
  for (const character of `jiwoos-farm:forest:v1:${scope}:${daySerial}`) {
    hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  }
  return hash >>> 0;
}

function randomFrom(seed: number) {
  let state = seed || 0x6d2b79f5;
  return () => {
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
    return (state >>> 0) / 0x100000000;
  };
}

/** Four-neighbour connectivity, including the return route and all three clearings. */
export function forestReachable(map: MapDefinition, start: { x: number; y: number }, target: { x: number; y: number }): boolean {
  const blocked = new Set<string>();
  for (const rect of map.collisionRegions) for (let y = rect.startY; y <= rect.endY; y++) for (let x = rect.startX; x <= rect.endX; x++) blocked.add(key(x, y));
  for (const object of map.objects) if (object.collision) blocked.add(key(Math.floor(object.position.tileX), Math.floor(object.position.tileY)));
  const open = (x: number, y: number) => x > 0 && y > 0 && x < map.width - 1 && y < map.height - 1 && !blocked.has(key(x, y)) && TILE_TYPE_DEFINITIONS[getTileTypeInMap(map, x, y)].walkable;
  if (!open(start.x, start.y) || !open(target.x, target.y)) return false;
  const queue = [start], seen = new Set([key(start.x, start.y)]);
  for (let i = 0; i < queue.length; i++) {
    const { x, y } = queue[i];
    if (x === target.x && y === target.y) return true;
    for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
      const nx = x + dx, ny = y + dy, next = key(nx, ny);
      if (open(nx, ny) && !seen.has(next)) { seen.add(next); queue.push({ x: nx, y: ny }); }
    }
  }
  return false;
}

/** A player-size rectangle must fit; tile-centre checks alone can leave restored players inside trunks. */
export function safeForestPosition(map: MapDefinition, x: number, y: number): boolean {
  const { frameSize, origin, collisionBox } = PLAYER_ASSET;
  const left = x - frameSize.width * origin.x + collisionBox.offsetX, right = left + collisionBox.width;
  const upper = y - frameSize.height * origin.y + collisionBox.offsetY, lower = upper + collisionBox.height;
  if (!Number.isFinite(x) || !Number.isFinite(y) || left < 16 || right > map.width * GAME_CONFIG.tileSize - 16 ||
      upper < 16 || lower > map.height * GAME_CONFIG.tileSize - 16) return false;
  const overlaps = (a: { x: number; y: number; width: number; height: number }) => left < a.x + a.width && right > a.x && upper < a.y + a.height && lower > a.y;
  const size = GAME_CONFIG.tileSize;
  for (const rect of map.collisionRegions) if (overlaps({ x: rect.startX * size, y: rect.startY * size, width: (rect.endX - rect.startX + 1) * size, height: (rect.endY - rect.startY + 1) * size })) return false;
  for (const object of map.objects) if (object.collision && overlaps({ x: object.position.tileX * size + object.collision.x, y: object.position.tileY * size + object.collision.y, width: object.collision.width, height: object.collision.height })) return false;
  for (const px of [left, right]) for (const py of [upper, lower]) if (!TILE_TYPE_DEFINITIONS[getTileTypeInMap(map, Math.floor(px / size), Math.floor(py / size))].walkable) return false;
  return true;
}

export function recoverForestPosition(map: MapDefinition, position: { x: number; y: number } | undefined) {
  if (position && safeForestPosition(map, position.x, position.y)) return position;
  return { x: FOREST_ENTRY.tileX * GAME_CONFIG.tileSize, y: FOREST_ENTRY.tileY * GAME_CONFIG.tileSize };
}

/** The reserved two-tile corridors and clearings precede obstacle placement. */
export function generateFairyForest(scope: string, daySerial: number): MapDefinition {
  const random = randomFrom(forestSeed(scope, daySerial));
  const reserved = new Set<string>();
  const reserve = (x: number, y: number, radius = 1) => {
    for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) reserved.add(key(x + dx, y + dy));
  };
  const clearings = [{ x: 15, y: 10 }, { x: 6, y: 6 }, { x: 25, y: 7 }];
  const drawPath = (from: { x: number; y: number }, to: { x: number; y: number }) => {
    let { x, y } = from;
    reserve(x, y);
    while (y !== to.y) { y += Math.sign(to.y - y); reserve(x, y); }
    while (x !== to.x) { x += Math.sign(to.x - x); reserve(x, y); }
  };
  drawPath({ x: 15, y: 22 }, clearings[0]);
  drawPath(clearings[0], clearings[1]);
  drawPath(clearings[0], clearings[2]);
  for (const clearing of clearings) reserve(clearing.x, clearing.y, 3);
  const objects: MapObjectDefinition[] = [];
  const terrainRegions: MapDefinition["terrainRegions"] = [];
  for (let y = 1; y < FOREST_HEIGHT - 1; y++) for (let x = 1; x < FOREST_WIDTH - 1; x++) {
    if (reserved.has(key(x, y))) {
      if (random() < 0.12) terrainRegions.push({ ...area(x, x, y, y), tileType: "path" });
      continue;
    }
    const roll = random();
    if (roll < 0.15) objects.push({ id: `tree-${x}-${y}`, assetId: "tree", position: { tileX: x + 0.5, tileY: y + 0.5 }, collision: { x: -11, y: -9, width: 22, height: 18 }, depth: 4 });
    else if (roll < 0.21) objects.push({ id: `rock-${x}-${y}`, assetId: "forest_rock", position: { tileX: x + 0.5, tileY: y + 0.5 }, collision: { x: -12, y: -9, width: 24, height: 19 }, depth: 3 });
    else if (roll < 0.34) terrainRegions.push({ ...area(x, x, y, y), tileType: roll < 0.25 ? "path" : "stone_floor" });
  }
  const map: MapDefinition = {
    id: FAIRY_FOREST_ID, name: "요정의 숲", width: FOREST_WIDTH, height: FOREST_HEIGHT, baseTileType: "grass",
    terrainRegions, farmAreas: [], collisionRegions: [], objects,
    spawns: [{ id: "entry", ...FOREST_ENTRY }],
    warps: [{ id: "to_road", area: area(14, 17, 22, 23), targetMapId: "road", targetSpawnId: "forest_return" }],
    boundary: { enabled: true },
  };
  for (const target of [...clearings, { x: 15, y: 22 }]) {
    if (!forestReachable(map, { x: 15, y: 20 }, target)) throw new Error("Forest route blocked");
  }
  if (!safeForestPosition(map, FOREST_ENTRY.tileX * GAME_CONFIG.tileSize, FOREST_ENTRY.tileY * GAME_CONFIG.tileSize)) throw new Error("Forest entry blocked");
  return map;
}
