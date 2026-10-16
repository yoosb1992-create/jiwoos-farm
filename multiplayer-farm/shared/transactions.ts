import { CROPS, ITEMS, RECIPES, itemName } from "./content.js";
import { DECORATIONS, calendar } from "./expansion.js";
import { plantingTree } from "./nature.js";
import { canCraft, maxCrafts, STACK_LIMIT } from "./household.js";
import { MAX_QUANTITY, type Member } from "./world.js";

export type TransactionType = "buyItem" | "sellItem" | "depositChest" | "withdrawChest" | "craftItem" | "shipItem" | "withdrawShipment";
export interface TransactionRequest { type: TransactionType; itemId: string; targetId?: string; shipmentId?: string; initial?: number }
export const transactionLabels: Record<TransactionType, string> = {
  buyItem: "구매", sellItem: "즉시 판매", depositChest: "보관함에 넣기", withdrawChest: "가방으로 꺼내기",
  craftItem: "제작", shipItem: "출하 예약", withdrawShipment: "출하 취소·회수",
};
export function purchasePrice(itemId: string, day: number): number {
  const crop = Object.values(CROPS).find(c => c.seedItemId === itemId);
  if (crop) return crop.seasons.includes(calendar(day).season) ? crop.seedPrice : 0;
  return plantingTree(itemId)?.seedPrice || DECORATIONS[itemId as keyof typeof DECORATIONS]?.price ||
    ({ stamina_biscuit: 10, animal_feed: 8, herb_tea: 45, harvest_stew: 95 } as Record<string, number>)[itemId] || 0;
}
export function roomFor(inventory: Record<string, number>, id: string, slots = 48): number {
  return (inventory[id] ?? 0) <= 0 && Object.values(inventory).filter(n => n > 0).length >= slots
    ? 0 : Math.max(0, STACK_LIMIT - (inventory[id] ?? 0));
}
export function transactionQuote(r: TransactionRequest, m: Member, day: number, chest: Record<string, number> = {}, capacity = 16) {
  const id = r.itemId, owned = m.inventory[id] ?? 0;
  const recipe = r.type === "craftItem" ? RECIPES[id] : undefined;
  const lot = r.type === "withdrawShipment" ? m.shipping?.pending.find(s => s.id === r.shipmentId && s.day === day) : undefined;
  const price = r.type === "buyItem" ? purchasePrice(id, day) : lot?.unitPrice ?? ITEMS[id]?.sellPrice ?? 0;
  let available = 0;
  switch (r.type) {
    case "buyItem": available = price > 0 ? Math.min(Math.floor(m.money / price), roomFor(m.inventory,id)) : 0; break;
    case "sellItem": available = price > 0 ? owned : 0; break;
    case "shipItem": {
      const pending = m.shipping?.pending.find(s => s.itemId === id && s.day === day && s.unitPrice === price)?.quantity ?? 0;
      available = price > 0 ? Math.min(owned, STACK_LIMIT-pending) : 0; break;
    }
    case "withdrawShipment": available = Math.min(lot?.quantity ?? 0, roomFor(m.inventory,id)); break;
    case "depositChest": available = ITEMS[id]?.kind === "tool" ? 0 : Math.min(owned,roomFor(chest,id,capacity)); break;
    case "withdrawChest": available = Math.min(chest[id] ?? 0,roomFor(m.inventory,id)); break;
    case "craftItem": available = recipe ? maxCrafts(m.inventory,recipe) : 0; break;
  }
  return {
    max: Math.max(0,Math.min(MAX_QUANTITY, available)), available, owned, price, recipe,
    name: recipe?.name ?? itemName(id),
    valid: (n: number) => Number.isSafeInteger(n) && n > 0 && n <= Math.min(MAX_QUANTITY,available) && (!recipe || canCraft(m.inventory,recipe,n)),
  };
}

export function parseQuantity(text: string): number | undefined {
  if (!/^[0-9]+$/.test(text)) return;
  const n = Number(text);
  return Number.isSafeInteger(n) && n > 0 ? n : undefined;
}
