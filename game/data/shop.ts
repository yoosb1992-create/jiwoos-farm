import type { ItemId } from "./items";

export interface ShopListing { id: string; itemId: ItemId; name: string; price: number; quantity: number }
export const GENERAL_STORE_LISTINGS: ShopListing[] = [
  { id: "sproutberry_seed", itemId: "sproutberry_seed", name: "새싹열매 씨앗", price: 20, quantity: 1 },
];
