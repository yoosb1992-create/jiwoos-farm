import type { ItemId } from "../data/items";

export interface RecipeIngredient { itemId: ItemId; quantity: number }
export interface CraftingRecipe {
  id: string;
  name: string;
  description: string;
  ingredients: readonly RecipeIngredient[];
  output: { itemId: ItemId; quantity: number };
  /** Reserved for later progression; absent means available from the start. */
  unlock?: { kind: "tool-level"; level: number };
}
