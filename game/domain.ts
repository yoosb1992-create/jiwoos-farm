import type { ToolKey } from "./events";
import { CROP_DEFINITIONS, getCropDefinition, type CropId } from "./data/crops";
import { ITEM_DEFINITIONS, type ItemId } from "./data/items";
import type { Facing } from "./assets/definitions";
import { GAME_CONFIG } from "./config";
import type { MapId } from "./maps/types";
import { MAP_DEFINITIONS } from "./maps/definitions";

export interface FarmTileData {
  x: number;
  y: number;
  tilled: boolean;
  wateredToday: boolean;
  cropType: CropId | null;
  cropStage: number | null;
  plantedDay: number | null;
}
export interface InventoryData { items: Partial<Record<ItemId, number>> }
export interface PlayerData { x: number; y: number; facing: Facing; mapId: MapId }
export interface SaveData {
  version: 4;
  day: number;
  timeMinutes: number;
  money: number;
  selectedTool: ToolKey;
  player: PlayerData;
  inventory: InventoryData;
  farm: FarmTileData[];
  savedAt: number;
}

export class Inventory {
  private readonly items: Partial<Record<ItemId, number>>;
  constructor(data: InventoryData = { items: { sproutberry_seed: GAME_CONFIG.startingSeedCount, sproutberry: 0 } }) { this.items = { ...data.items }; }
  count(itemId: ItemId) { return this.items[itemId] ?? 0; }
  consume(itemId: ItemId, amount = 1) {
    if (this.count(itemId) < amount) return false;
    this.items[itemId] = this.count(itemId) - amount;
    return true;
  }
  add(itemId: ItemId, amount = 1) { this.items[itemId] = this.count(itemId) + amount; }
  sellAll(itemId: ItemId, price: number) {
    const amount = this.count(itemId);
    this.items[itemId] = 0;
    return { amount, earned: amount * price };
  }
  serialize(): InventoryData { return { items: { ...this.items } }; }
}

export function purchaseInventoryItem(inventory: Inventory, money: number, itemId: ItemId, price: number, quantity = 1) {
  if (money < price) return { purchased: false, money };
  inventory.add(itemId, quantity);
  return { purchased: true, money: money - price };
}

export function advanceFarmDay(farm: FarmTileData[]) {
  let grown = 0;
  for (const tile of farm) {
    if (tile.wateredToday && tile.cropType && tile.cropStage !== null) {
      const crop = getCropDefinition(tile.cropType);
      const currentGrowthDay = crop.stages[tile.cropStage]?.growthDay ?? 0;
      const nextGrowthDay = Math.min(crop.growthDays, currentGrowthDay + 1);
      const nextStage = crop.stages.findLastIndex((stage) => stage.growthDay <= nextGrowthDay);
      if (nextStage > tile.cropStage) { tile.cropStage = nextStage; grown += 1; }
    }
    tile.wateredToday = false;
  }
  return grown;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const finiteNumber = (value: unknown, fallback: number) => typeof value === "number" && Number.isFinite(value) ? value : fallback;
const nonNegativeInteger = (value: unknown, fallback: number) => typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback;
const isFacing = (value: unknown): value is Facing => value === "up" || value === "down" || value === "left" || value === "right";
const isTool = (value: unknown): value is ToolKey => value === "hoe" || value === "seed" || value === "water" || value === "hand";
const isMapId = (value: unknown): value is MapId => typeof value === "string" && Object.hasOwn(MAP_DEFINITIONS, value);
const isItemId = (value: string): value is ItemId => Object.hasOwn(ITEM_DEFINITIONS, value);
const isCropId = (value: unknown): value is CropId => typeof value === "string" && Object.hasOwn(CROP_DEFINITIONS, value);

const defaultPlayer = (mapId: MapId): PlayerData => {
  const spawn = MAP_DEFINITIONS[mapId].spawns[0];
  return { x: spawn.tileX * GAME_CONFIG.tileSize, y: spawn.tileY * GAME_CONFIG.tileSize, facing: spawn.facing, mapId };
};

const normalizeInventory = (value: unknown): InventoryData => {
  const items = isRecord(value) && isRecord(value.items) ? value.items : null;
  if (!items) return new Inventory().serialize();
  const normalized: Partial<Record<ItemId, number>> = {};
  for (const [itemId, amount] of Object.entries(items)) if (isItemId(itemId)) normalized[itemId] = nonNegativeInteger(amount, 0);
  return { items: normalized };
};

const normalizeFarm = (value: unknown): FarmTileData[] => {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry): FarmTileData[] => {
    if (!isRecord(entry) || !Number.isInteger(entry.x) || !Number.isInteger(entry.y)) return [];
    const cropType = isCropId(entry.cropType) ? entry.cropType : null;
    const maxStage = cropType ? CROP_DEFINITIONS[cropType].stages.length - 1 : -1;
    const cropStage = cropType && Number.isInteger(entry.cropStage)
      ? Math.max(0, Math.min(maxStage, entry.cropStage as number)) : null;
    return [{
      x: entry.x as number, y: entry.y as number, tilled: entry.tilled === true,
      wateredToday: cropStage !== null && entry.wateredToday === true,
      cropType: cropStage === null ? null : cropType, cropStage,
      plantedDay: cropStage === null ? null : nonNegativeInteger(entry.plantedDay, 1),
    }];
  });
};

const normalizeV4 = (value: unknown): SaveData | null => {
  if (!isRecord(value) || value.version !== 4) return null;
  const rawPlayer = isRecord(value.player) ? value.player : {};
  const mapId: MapId = isMapId(rawPlayer.mapId) ? rawPlayer.mapId : "farm";
  const fallbackPlayer = defaultPlayer(mapId);
  const invalidMap = !isMapId(rawPlayer.mapId);
  const player = invalidMap ? fallbackPlayer : {
    mapId,
    x: finiteNumber(rawPlayer.x, fallbackPlayer.x),
    y: finiteNumber(rawPlayer.y, fallbackPlayer.y),
    facing: isFacing(rawPlayer.facing) ? rawPlayer.facing : fallbackPlayer.facing,
  };
  return {
    version: 4,
    day: Math.min(GAME_CONFIG.day.daysPerSeason, Math.max(1, nonNegativeInteger(value.day, 1))),
    timeMinutes: Math.min(GAME_CONFIG.day.endMinutes, Math.max(GAME_CONFIG.day.startMinutes, nonNegativeInteger(value.timeMinutes, GAME_CONFIG.day.startMinutes))),
    money: nonNegativeInteger(value.money, GAME_CONFIG.startingMoney),
    selectedTool: isTool(value.selectedTool) ? value.selectedTool : "hoe",
    player,
    inventory: normalizeInventory(value.inventory),
    farm: normalizeFarm(value.farm),
    savedAt: finiteNumber(value.savedAt, Date.now()),
  };
};

export const normalizeSaveData = (value: unknown): SaveData | null => {
  if (!isRecord(value) || !Number.isInteger(value.version)) return null;
  if (value.version === 4) return normalizeV4(value);
  const rawPlayer = isRecord(value.player) ? value.player : {};
  if (value.version === 3) return normalizeV4({ ...value, version: 4, player: { ...rawPlayer, mapId: "farm" } });
  const legacyInventory = isRecord(value.inventory) ? value.inventory : {};
  const inventory = { items: { sproutberry_seed: legacyInventory.seeds, sproutberry: legacyInventory.harvest } };
  if (value.version === 2) return normalizeV4({ ...value, version: 4, player: { ...rawPlayer, mapId: "farm" }, inventory });
  if (value.version === 1) {
    const farm = Array.isArray(value.farm) ? value.farm.map((entry) => {
      const tile = isRecord(entry) ? entry : {};
      const planted = Number.isInteger(tile.cropStage);
      return { ...tile, wateredToday: tile.watered === true, cropType: planted ? "sproutberry" : null, cropStage: planted ? tile.cropStage : null, plantedDay: planted ? 1 : null };
    }) : [];
    return normalizeV4({ ...value, version: 4, day: 1, timeMinutes: GAME_CONFIG.day.startMinutes, player: { ...rawPlayer, mapId: "farm" }, inventory, farm });
  }
  return null;
};

export interface SaveRepository { save(data: SaveData): void; load(): SaveData | null }
export class LocalStorageSaveRepository implements SaveRepository {
  private readonly key = "jiwoos-farm.save.v4";
  save(data: SaveData) { localStorage.setItem(this.key, JSON.stringify(data)); }
  load(): SaveData | null {
    for (const key of [this.key, "jiwoos-farm.save.v3", "jiwoos-farm.save.v2", "jiwoos-farm.save.v1"]) {
      const stored = localStorage.getItem(key);
      if (!stored) continue;
      try {
        const normalized = normalizeSaveData(JSON.parse(stored));
        if (normalized) return normalized;
      } catch { /* Try an older recoverable save before starting fresh. */ }
    }
    return null;
  }
}

export const cropRegistry = CROP_DEFINITIONS;
