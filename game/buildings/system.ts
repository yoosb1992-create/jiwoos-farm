import { GAME_CONFIG } from "../config";
import type { FarmTileData, Inventory } from "../domain";
import { FARM_EXPANSIONS, inside } from "../farm/expansions";
import { getTileTypeInMap, MAP_DEFINITIONS, TILE_TYPE_DEFINITIONS } from "../maps/definitions";
import type { MapDefinition } from "../maps/types";
import { PLACEABLE_DEFINITIONS } from "../placeables/definitions";
import type { PlaceablesData } from "../placeables/types";
import { BUILDING_DEFINITIONS, isBuildingId } from "./definitions";
import type { BuildingId, BuildingInstance, BuildingsData } from "./types";

export const initialBuildings = (): BuildingsData => ({ instances: [] });
const overlaps = (a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
export function normalizeBuildings(value: unknown, daySerial: number): BuildingsData {
  const raw = value && typeof value === "object" ? (value as Partial<BuildingsData>).instances : null;
  if (!Array.isArray(raw)) return initialBuildings();
  const instances: BuildingInstance[] = [], ids = new Set<string>();
  for (const candidate of raw) {
    if (!candidate || typeof candidate !== "object") continue;
    const b = candidate as Partial<BuildingInstance>;
    if (!isBuildingId(b.definitionId) || typeof b.id !== "string" || !b.id || b.id.length > 80 || ids.has(b.id) ||
      typeof b.mapId !== "string" || !BUILDING_DEFINITIONS[b.definitionId].maps.includes(b.mapId) ||
      !Number.isSafeInteger(b.tileX) || (b.tileX as number) < 0 || !Number.isSafeInteger(b.tileY) || (b.tileY as number) < 0 ||
      !Number.isSafeInteger(b.startedDaySerial) || (b.startedDaySerial as number) < 1 || !Number.isSafeInteger(b.readyDaySerial) || (b.readyDaySerial as number) < (b.startedDaySerial as number)) continue;
    const map = MAP_DEFINITIONS[b.mapId], footprint = BUILDING_DEFINITIONS[b.definitionId].footprint;
    if (!map || (b.tileX as number) + footprint.width > map.width || (b.tileY as number) + footprint.height > map.height) continue;
    instances.push({ id: b.id, definitionId: b.definitionId, mapId: b.mapId, tileX: b.tileX as number, tileY: b.tileY as number,
      status: daySerial >= (b.readyDaySerial as number) ? "ready" : "constructing", startedDaySerial: b.startedDaySerial as number,
      readyDaySerial: b.readyDaySerial as number, upgradeLevel: Number.isSafeInteger(b.upgradeLevel) && (b.upgradeLevel as number) >= 1 ? b.upgradeLevel as number : 1 });
    ids.add(b.id);
  }
  return { instances };
}
export function buildingPlacementError(buildings: BuildingsData, placeables: PlaceablesData, farm: FarmTileData[], map: MapDefinition,
  definitionId: unknown, x: unknown, y: unknown, players: { x: number; y: number; mapId: string }[]): string | null {
  if (!isBuildingId(definitionId)) return "없는 건물이에요.";
  const def = BUILDING_DEFINITIONS[definitionId];
  if (!def.maps.includes(map.id)) return "이 맵에는 건설할 수 없어요.";
  if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y) || (x as number) < 0 || (y as number) < 0) return "맵 안의 칸을 선택해 주세요.";
  const rect = { x: x as number, y: y as number, ...def.footprint };
  if (rect.x + rect.width > map.width || rect.y + rect.height > map.height) return "맵 밖에는 건설할 수 없어요.";
  for (let ty = rect.y; ty < rect.y + rect.height; ty++) for (let tx = rect.x; tx < rect.x + rect.width; tx++) {
    const tile = TILE_TYPE_DEFINITIONS[getTileTypeInMap(map, tx, ty)];
    if (!tile.walkable || tile.farmable || tile.graphicAssetId !== "tile_grass" || map.collisionRegions.some(r => inside(r, tx, ty)) ||
      Object.values(FARM_EXPANSIONS).some(expansion => inside(expansion.area, tx, ty)) || farm.some(t => t.x === tx && t.y === ty)) return "농지·길·물 위에는 건설할 수 없어요.";
    if (map.warps.some(w => tx >= w.area.startX - 1 && tx <= w.area.endX + 1 && ty >= w.area.startY - 1 && ty <= w.area.endY + 1)) return "출입구를 막을 수 없어요.";
  }
  if (players.some(p => p.mapId === map.id && overlaps(rect, { x: Math.floor(p.x / GAME_CONFIG.tileSize), y: Math.floor(p.y / GAME_CONFIG.tileSize), width: 1, height: 1 }))) return "플레이어 위치와 겹쳐요.";
  if (buildings.instances.some(b => b.mapId === map.id && overlaps(rect, { x: b.tileX, y: b.tileY, ...BUILDING_DEFINITIONS[b.definitionId].footprint }))) return "다른 건물과 겹쳐요.";
  if (placeables.instances.some(p => p.mapId === map.id && overlaps(rect, { x: p.tileX, y: p.tileY, ...PLACEABLE_DEFINITIONS[p.definitionId].footprint }))) return "배치된 기계와 겹쳐요.";
  const pixel = { x: rect.x * GAME_CONFIG.tileSize, y: rect.y * GAME_CONFIG.tileSize, width: rect.width * GAME_CONFIG.tileSize, height: rect.height * GAME_CONFIG.tileSize };
  if (map.objects.some(o => o.collision && overlaps(pixel, { x: o.position.tileX * GAME_CONFIG.tileSize + o.collision.x,
    y: o.position.tileY * GAME_CONFIG.tileSize + o.collision.y, width: o.collision.width, height: o.collision.height }))) return "기존 오브젝트와 겹쳐요.";
  return null;
}
export function constructBuilding(buildings: BuildingsData, placeables: PlaceablesData, farm: FarmTileData[], inventory: Inventory,
  money: number, map: MapDefinition, definitionId: unknown, x: unknown, y: unknown, players: { x: number; y: number; mapId: string }[],
  instanceId: string, daySerial: number): { error: string | null; money: number } {
  const error = buildingPlacementError(buildings, placeables, farm, map, definitionId, x, y, players);
  if (error) return { error, money };
  const def = BUILDING_DEFINITIONS[definitionId as BuildingId];
  if (!instanceId || instanceId.length > 80 || buildings.instances.some(b => b.id === instanceId) || !Number.isSafeInteger(daySerial) || daySerial < 1) return { error: "건설 요청이 올바르지 않아요.", money };
  if (money < def.cost.money || def.cost.materials.some(m => inventory.count(m.itemId) < m.quantity)) return { error: "건설 비용이 부족해요.", money };
  for (const m of def.cost.materials) inventory.consume(m.itemId, m.quantity);
  buildings.instances.push({ id: instanceId, definitionId: def.id, mapId: map.id, tileX: x as number, tileY: y as number,
    status: def.constructionDays ? "constructing" : "ready", startedDaySerial: daySerial, readyDaySerial: daySerial + def.constructionDays, upgradeLevel: 1 });
  return { error: null, money: money - def.cost.money };
}
