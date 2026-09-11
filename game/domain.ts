import type { ToolKey } from "./events";
import { CROP_DEFINITIONS, getCropDefinition, type CropId } from "./data/crops";
import type { ItemId } from "./data/items";
import type { Facing } from "./assets/definitions";
import { GAME_CONFIG } from "./config";

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
export interface PlayerData { x: number; y: number; facing: Facing }
export interface SaveData {
  version: 3;
  day: number;
  timeMinutes: number;
  money: number;
  selectedTool: ToolKey;
  player: PlayerData;
  inventory: InventoryData;
  farm: FarmTileData[];
  savedAt: number;
}

interface Version2InventoryData { seeds: number; harvest: number }
interface Version2SaveData extends Omit<SaveData, "version" | "inventory"> { version: 2; inventory: Version2InventoryData }
interface Version1FarmTileData { x: number; y: number; tilled: boolean; watered: boolean; cropStage: number | null; lastGrowthAt: number | null }
interface Version1SaveData {
  version: 1; money: number; selectedTool: ToolKey; player: PlayerData;
  inventory: Version2InventoryData; farm: Version1FarmTileData[]; savedAt: number;
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

const migrateV2 = (data: Version2SaveData): SaveData => ({
  ...data, version: 3,
  inventory: { items: { sproutberry_seed: data.inventory.seeds, sproutberry: data.inventory.harvest } },
});

const migrateV1 = (data: Version1SaveData): SaveData => ({
  version: 3, day: 1, timeMinutes: GAME_CONFIG.day.startMinutes, money: data.money, selectedTool: data.selectedTool, player: data.player,
  inventory: { items: { sproutberry_seed: data.inventory.seeds, sproutberry: data.inventory.harvest } },
  farm: data.farm.map((tile) => ({
    x: tile.x, y: tile.y, tilled: tile.tilled, wateredToday: tile.watered,
    cropType: tile.cropStage === null ? null : "sproutberry", cropStage: tile.cropStage,
    plantedDay: tile.cropStage === null ? null : 1,
  })),
  savedAt: data.savedAt,
});

export interface SaveRepository { save(data: SaveData): void; load(): SaveData | null }
export class LocalStorageSaveRepository implements SaveRepository {
  private readonly key = "jiwoos-farm.save.v3";
  save(data: SaveData) { localStorage.setItem(this.key, JSON.stringify(data)); }
  load(): SaveData | null {
    try {
      const current = localStorage.getItem(this.key);
      if (current) return JSON.parse(current) as SaveData;
      const v2 = localStorage.getItem("jiwoos-farm.save.v2");
      if (v2) return migrateV2(JSON.parse(v2) as Version2SaveData);
      const v1 = localStorage.getItem("jiwoos-farm.save.v1");
      return v1 ? migrateV1(JSON.parse(v1) as Version1SaveData) : null;
    } catch { return null; }
  }
}

export const cropRegistry = CROP_DEFINITIONS;
