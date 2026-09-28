import type { ItemId } from "./items";

export interface ShopListing { id: string; itemId: ItemId; name: string; price: number; quantity: number }
export const GENERAL_STORE_LISTINGS: ShopListing[] = [
  { id: "sproutberry_seed", itemId: "sproutberry_seed", name: "새싹열매 씨앗", price: 20, quantity: 1 },
  { id: "sunpotato_seed", itemId: "sunpotato_seed", name: "햇살감자 씨앗", price: 30, quantity: 1 },
  { id: "heartberry_seed", itemId: "heartberry_seed", name: "하트딸기 씨앗", price: 45, quantity: 1 },
  { id: "morningcarrot_seed", itemId: "morningcarrot_seed", name: "아침당근 씨앗", price: 25, quantity: 1 },
];
