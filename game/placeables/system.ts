import type { Inventory } from "../domain";
import { GAME_CONFIG } from "../config";
import { getTileTypeInMap, MAP_DEFINITIONS, TILE_TYPE_DEFINITIONS } from "../maps/definitions";
import type { MapDefinition } from "../maps/types";
import { advanceMachine, idleMachine, normalizeMachine } from "../machines/system";
import { isPlaceableId, PLACEABLE_DEFINITIONS } from "./definitions";
import type { PlaceableId, PlaceableInstance, PlaceablesData } from "./types";
import { BUILDING_DEFINITIONS } from "../buildings/definitions";
import type { BuildingsData } from "../buildings/types";
import { FARM_EXPANSIONS } from "../farm/expansions";

export const initialPlaceables = (): PlaceablesData => ({ instances: [] });
const safeTile = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;
const contains = (r: { startX: number; endX: number; startY: number; endY: number }, x: number, y: number) => x >= r.startX && x <= r.endX && y >= r.startY && y <= r.endY;
const overlaps = (a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) =>
  a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

export function normalizePlaceables(value: unknown, now?: number): PlaceablesData {
  const raw = value && typeof value === "object" && !Array.isArray(value) ? (value as { instances?: unknown }).instances : null;
  if (!Array.isArray(raw)) return initialPlaceables();
  const instances: PlaceableInstance[] = [], ids = new Set<string>();
  for (const candidate of raw) {
    const entry = candidate as Partial<PlaceableInstance>;
    if (!entry || typeof entry !== "object" || !isPlaceableId(entry.definitionId) || typeof entry.id !== "string" || !entry.id || entry.id.length > 80 || ids.has(entry.id) ||
        typeof entry.mapId !== "string" || !PLACEABLE_DEFINITIONS[entry.definitionId].maps.includes(entry.mapId) || !safeTile(entry.tileX) || !safeTile(entry.tileY)) continue;
    const map = MAP_DEFINITIONS[entry.mapId], footprint = PLACEABLE_DEFINITIONS[entry.definitionId].footprint;
    if (!map || entry.tileX + footprint.width > map.width || entry.tileY + footprint.height > map.height) continue;
    const machine = normalizeMachine(entry.state?.machine);
    if (now !== undefined) {
      if (machine.status === "ready" && machine.completesAt !== null && machine.completesAt > now) machine.status = "processing";
      advanceMachine(machine, now);
    }
    instances.push({ id: entry.id, definitionId: entry.definitionId, mapId: entry.mapId, tileX: entry.tileX, tileY: entry.tileY,
      facing: entry.facing === "up" || entry.facing === "down" || entry.facing === "left" || entry.facing === "right" ? entry.facing : "down", state: { machine } });
    ids.add(entry.id);
  }
  return { instances };
}

export function placementError(data: PlaceablesData, definitionId: unknown, map: MapDefinition, x: unknown, y: unknown,
  players: { x: number; y: number; mapId: string }[], buildings?: BuildingsData): string | null {
  if (!isPlaceableId(definitionId)) return "배치할 수 없는 오브젝트예요.";
  const definition = PLACEABLE_DEFINITIONS[definitionId];
  if (!definition.maps.includes(map.id)) return "이 맵에는 배치할 수 없어요.";
  if (!safeTile(x) || !safeTile(y)) return "맵 안의 칸을 선택해 주세요.";
  const tileX = x as number, tileY = y as number, rect = { x: tileX, y: tileY, width: definition.footprint.width, height: definition.footprint.height };
  if (tileX + rect.width > map.width || tileY + rect.height > map.height) return "맵 밖에는 배치할 수 없어요.";
  for (let ty = tileY; ty < tileY + rect.height; ty++) for (let tx = tileX; tx < tileX + rect.width; tx++) {
    const type = getTileTypeInMap(map, tx, ty);
    if (!TILE_TYPE_DEFINITIONS[type].walkable || TILE_TYPE_DEFINITIONS[type].farmable || map.farmAreas.some(area => contains(area, tx, ty)) ||
        map.collisionRegions.some(area => contains(area, tx, ty))) return "농지나 장애물 위에는 배치할 수 없어요.";
    if (map.warps.some(w => tx >= w.area.startX - 1 && tx <= w.area.endX + 1 && ty >= w.area.startY - 1 && ty <= w.area.endY + 1))
      return "출입구를 막을 수 없어요.";
    if (Object.values(FARM_EXPANSIONS).some(expansion => contains(expansion.area, tx, ty))) return "확장 농지에는 배치할 수 없어요.";
  }
  if (players.some(p => p.mapId === map.id && overlaps(rect, { x: Math.floor(p.x / GAME_CONFIG.tileSize), y: Math.floor(p.y / GAME_CONFIG.tileSize), width: 1, height: 1 })))
    return "플레이어가 서 있는 칸에는 배치할 수 없어요.";
  if (data.instances.some(p => p.mapId === map.id && overlaps(rect, { x: p.tileX, y: p.tileY, ...PLACEABLE_DEFINITIONS[p.definitionId].footprint })))
    return "다른 오브젝트와 겹쳐요.";
  if (buildings?.instances.some(b => b.mapId === map.id && overlaps(rect, { x: b.tileX, y: b.tileY, ...BUILDING_DEFINITIONS[b.definitionId].footprint }))) return "건물과 겹쳐요.";
  const pixel = { x: tileX * GAME_CONFIG.tileSize, y: tileY * GAME_CONFIG.tileSize, width: rect.width * GAME_CONFIG.tileSize, height: rect.height * GAME_CONFIG.tileSize };
  if (map.objects.some(o => o.collision && overlaps(pixel, {
    x: o.position.tileX * GAME_CONFIG.tileSize + o.collision.x, y: o.position.tileY * GAME_CONFIG.tileSize + o.collision.y,
    width: o.collision.width, height: o.collision.height,
  }))) return "기존 오브젝트 위에는 배치할 수 없어요.";
  return null;
}

export function placeObject(data: PlaceablesData, inventory: Inventory, definitionId: unknown, map: MapDefinition, x: unknown, y: unknown,
  players: { x: number; y: number; mapId: string }[], id: string, buildings?: BuildingsData): string | null {
  const error = placementError(data, definitionId, map, x, y, players, buildings);
  if (error) return error;
  const definition = PLACEABLE_DEFINITIONS[definitionId as PlaceableId];
  if (typeof id !== "string" || !id || id.length > 80 || data.instances.some(p => p.id === id)) return "오브젝트 ID가 올바르지 않아요.";
  if (inventory.count(definition.itemId) < 1) return "배치할 기계가 가방에 없어요.";
  inventory.consume(definition.itemId);
  data.instances.push({ id, definitionId: definition.id, mapId: map.id, tileX: x as number, tileY: y as number, facing: "down", state: { machine: idleMachine() } });
  return null;
}

export function removeObject(data: PlaceablesData, inventory: Inventory, id: unknown, pose: { x: number; y: number; mapId: string }): string | null {
  const instance = data.instances.find(p => p.id === id);
  if (!instance || instance.mapId !== pose.mapId) return "없는 오브젝트예요.";
  if (instance.state.machine.status !== "idle") return "가공 중이거나 결과물이 남은 기계는 회수할 수 없어요.";
  if (Math.hypot(pose.x - (instance.tileX + .5) * GAME_CONFIG.tileSize, pose.y - (instance.tileY + .5) * GAME_CONFIG.tileSize) > 70) return "기계 가까이에서 회수해 주세요.";
  const definition = PLACEABLE_DEFINITIONS[instance.definitionId];
  if (!Number.isSafeInteger(inventory.count(definition.itemId) + 1)) return "가방 수량이 너무 많아요.";
  data.instances.splice(data.instances.indexOf(instance), 1); inventory.add(definition.itemId);
  return null;
}
