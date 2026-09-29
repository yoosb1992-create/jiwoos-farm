import type { BuildingId } from "../buildings/types";
import type { ItemId } from "../data/items";

export type AnimalSpeciesId = "chicken";
export interface AnimalDefinition {
  id: AnimalSpeciesId; name: string; assetId: import("../assets/definitions").WorldObjectAssetId;
  homeBuildingTypes: readonly BuildingId[]; produceItemId: ItemId; productionDays: number; purchasePrice: number; produceSellPrice: number;
  friendshipMax: number; petFriendship: number; growthDays?: number; qualityTiers?: readonly string[];
}
export interface AnimalInstance {
  id: string; species: AnimalSpeciesId; name: string; homeBuildingId: string; ageDays: number;
  friendship: number; lastPettedDaySerial: number; lastFedDaySerial: number; lastProducedDaySerial: number;
  produceReady: ItemId | null;
}
export interface RanchState { animals: AnimalInstance[]; lastDailyProcessedDaySerial: number }
