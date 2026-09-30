import type { Inventory } from "../domain";
import type { ItemId } from "./items";
import type { PlayerStats } from "../player/stats";

export const FOOD_DEFINITIONS = {
  stamina_biscuit: {
    itemId: "stamina_biscuit",
    staminaRestore: 25,
  },
} as const;

export type FoodItemId = keyof typeof FOOD_DEFINITIONS;

export const isFoodItemId = (value: unknown): value is FoodItemId =>
  typeof value === "string" && Object.hasOwn(FOOD_DEFINITIONS, value);

export interface ConsumeFoodResult {
  consumed: boolean;
  restoredAmount: number;
  message: string;
}

/** Shared mutation helper for local play and Family authority. */
export function consumeFood(inventory: Inventory, stats: PlayerStats, itemId: ItemId): ConsumeFoodResult {
  if (!isFoodItemId(itemId)) return { consumed: false, restoredAmount: 0, message: "먹을 수 있는 음식이 아니에요." };
  if (inventory.count(itemId) < 1) return { consumed: false, restoredAmount: 0, message: "스테미나 비스켓이 없어요." };
  if (stats.stamina >= stats.maxStamina) return { consumed: false, restoredAmount: 0, message: "스테미나가 이미 가득 차 있어요." };
  const definition = FOOD_DEFINITIONS[itemId];
  const restoredAmount = Math.min(definition.staminaRestore, stats.maxStamina - stats.stamina);
  if (!inventory.consume(itemId)) return { consumed: false, restoredAmount: 0, message: "스테미나 비스켓이 없어요." };
  stats.stamina = Math.min(stats.maxStamina, stats.stamina + restoredAmount);
  return { consumed: true, restoredAmount, message: `스테미나 비스켓을 먹어 스테미나 ${restoredAmount}를 회복했어요.` };
}
