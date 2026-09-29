import type { FarmTileData } from "../domain";
import { canPerformAction, recordSuccessfulAction, type PlayerStats } from "../player/stats";

export const WATERING_CAN_CAPACITY = 30;
export interface WateringCanState { currentWater: number; capacity: number }
export const initialWateringCan = (): WateringCanState => ({ currentWater: WATERING_CAN_CAPACITY, capacity: WATERING_CAN_CAPACITY });

export function normalizeWateringCan(value: unknown): WateringCanState {
  if (!value || typeof value !== "object" || Array.isArray(value)) return initialWateringCan();
  const raw = value as Partial<WateringCanState>;
  const capacity = Number.isSafeInteger(raw.capacity) && raw.capacity! > 0 && raw.capacity! <= 10_000 ? raw.capacity! : WATERING_CAN_CAPACITY;
  const currentWater = Number.isSafeInteger(raw.currentWater) && raw.currentWater! >= 0 ? Math.min(capacity, raw.currentWater!) : capacity;
  return { currentWater, capacity };
}

/** Validate everything before mutating crop, stamina, XP, or water. */
export function waterCrop(tile: FarmTileData, stats: PlayerStats, wateringCan: WateringCanState): string | null {
  if (tile.cropStage === null || !tile.cropType) return "먼저 씨앗을 심어 주세요.";
  if (tile.wateredToday) return "오늘은 이미 촉촉하게 물을 주었어요.";
  if (wateringCan.currentWater <= 0) return "물뿌리개가 비었어요. 물가에서 다시 채워 주세요.";
  if (!canPerformAction(stats, "water")) return "체력이 부족합니다. 잠을 자고 회복하세요.";
  tile.wateredToday = true;
  wateringCan.currentWater -= 1;
  recordSuccessfulAction(stats, "water");
  return null;
}

export function refillWateringCan(wateringCan: WateringCanState): boolean {
  if (wateringCan.currentWater >= wateringCan.capacity) return false;
  wateringCan.currentWater = wateringCan.capacity;
  return true;
}
