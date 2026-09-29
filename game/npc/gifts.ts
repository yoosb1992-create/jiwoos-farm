import type { ItemId } from "../data/items";
import type { Inventory } from "../domain";
import { getNpc } from "./definitions";
import { RELATIONSHIP_RULES, type PlayerProgress } from "./progress";

export type GiftPreference = "loved" | "neutral" | "disliked";
export const GIFT_RULES = {
  points: { loved: 25, neutral: 10, disliked: 0 },
  perNpcPerDay: 1,
} as const;

export function giftPreference(npcId: string, itemId: ItemId): GiftPreference {
  const preferences = getNpc(npcId)?.giftPreferences;
  if (!preferences) throw new Error("없는 주민입니다.");
  if (preferences.loved.includes(itemId)) return "loved";
  if (preferences.disliked.includes(itemId)) return "disliked";
  return "neutral";
}

export interface GiftResult { error: string | null; preference?: GiftPreference; points?: number }
export function giftToNpc(progress: PlayerProgress, inventory: Inventory, npcId: string, itemId: ItemId, daySerial: number): GiftResult {
  const relationship = progress.relationships[npcId];
  if (!getNpc(npcId) || !relationship) return { error: "없는 주민입니다." };
  if (!Number.isSafeInteger(daySerial) || daySerial < 1) return { error: "선물 날짜를 확인해 주세요." };
  if (relationship.lastGiftDaySerial === daySerial) return { error: "오늘은 이미 이 주민에게 선물했어요." };
  if (inventory.count(itemId) < 1) return { error: "가방에 선물할 아이템이 없어요." };
  const preference = giftPreference(npcId, itemId), points = GIFT_RULES.points[preference];
  if (!inventory.consume(itemId, 1)) return { error: "가방에 선물할 아이템이 없어요." };
  relationship.lastGiftDaySerial = daySerial;
  relationship.points = Math.min(RELATIONSHIP_RULES.maxPoints, relationship.points + points);
  return { error: null, preference, points };
}
