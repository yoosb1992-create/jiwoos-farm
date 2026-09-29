import type { FarmTileData, Inventory } from "../domain";
import type { ItemId } from "../data/items";
import type { TileRect } from "../maps/types";
import { PLACEABLE_DEFINITIONS } from "../placeables/definitions";
import type { PlaceablesData } from "../placeables/types";
import { BUILDING_DEFINITIONS } from "../buildings/definitions";
import type { BuildingsData } from "../buildings/types";

export type ExpansionId = "south_plot";
export interface FarmProgress { unlocked: ExpansionId[] }
export interface ExpansionDefinition { id: ExpansionId; name: string; area: TileRect; money: number; materials: readonly { itemId: ItemId; quantity: number }[] }
// Farm map: south of the original 9..18,8..14 field, west of the 24..30 pond and clear of the 19..22 southern exit.
export const FARM_EXPANSIONS: Record<ExpansionId, ExpansionDefinition> = {
  south_plot: { id: "south_plot", name: "남쪽 작은 밭", area: { startX: 9, endX: 12, startY: 17, endY: 19 }, money: 60, materials: [{ itemId: "wood_plank", quantity: 1 }] },
};
export const initialFarmProgress = (): FarmProgress => ({ unlocked: [] });
export function normalizeFarmProgress(value: unknown): FarmProgress {
  const raw = value && typeof value === "object" ? (value as Partial<FarmProgress>).unlocked : null;
  return { unlocked: Array.isArray(raw) ? [...new Set(raw.filter((id): id is ExpansionId => typeof id === "string" && Object.hasOwn(FARM_EXPANSIONS, id)))] : [] };
}
export const inside = (r: TileRect, x: number, y: number) => x >= r.startX && x <= r.endX && y >= r.startY && y <= r.endY;
export function isFarmTile(map: { farmAreas: TileRect[] }, progress: FarmProgress, x: number, y: number) {
  return map.farmAreas.some(r => inside(r, x, y)) || progress.unlocked.some(id => inside(FARM_EXPANSIONS[id].area, x, y));
}
export function expansionTiles(id: ExpansionId): FarmTileData[] {
  const { area } = FARM_EXPANSIONS[id], tiles: FarmTileData[] = [];
  for (let y = area.startY; y <= area.endY; y++) for (let x = area.startX; x <= area.endX; x++)
    tiles.push({ x, y, tilled: false, wateredToday: false, cropType: null, cropStage: null, plantedDay: null });
  return tiles;
}
export function unlockExpansion(progress: FarmProgress, farm: FarmTileData[], inventory: Inventory, money: number, id: unknown,
  placeables?: PlaceablesData, buildings?: BuildingsData): { error: string | null; money: number } {
  if (typeof id !== "string" || !Object.hasOwn(FARM_EXPANSIONS, id)) return { error: "없는 농지 확장이에요.", money };
  const definition = FARM_EXPANSIONS[id as ExpansionId];
  if (progress.unlocked.includes(definition.id)) return { error: "이미 확장한 농지예요.", money };
  const overlaps = (x: number, y: number, width: number, height: number) =>
    x <= definition.area.endX && x + width > definition.area.startX && y <= definition.area.endY && y + height > definition.area.startY;
  if (placeables?.instances.some(p => p.mapId === "farm" && overlaps(p.tileX, p.tileY,
    PLACEABLE_DEFINITIONS[p.definitionId].footprint.width, PLACEABLE_DEFINITIONS[p.definitionId].footprint.height)) ||
    buildings?.instances.some(b => b.mapId === "farm" && overlaps(b.tileX, b.tileY,
      BUILDING_DEFINITIONS[b.definitionId].footprint.width, BUILDING_DEFINITIONS[b.definitionId].footprint.height)))
    return { error: "확장할 땅의 오브젝트를 먼저 비워 주세요.", money };
  if (expansionTiles(definition.id).some(tile => farm.some(existing => existing.x === tile.x && existing.y === tile.y))) return { error: "이미 사용 중인 농지예요.", money };
  if (money < definition.money || definition.materials.some(m => inventory.count(m.itemId) < m.quantity)) return { error: "농지 확장 비용이 부족해요.", money };
  for (const material of definition.materials) inventory.consume(material.itemId, material.quantity);
  progress.unlocked.push(definition.id);
  farm.push(...expansionTiles(definition.id));
  return { error: null, money: money - definition.money };
}
