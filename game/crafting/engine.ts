import type { Inventory } from "../domain";
import type { CraftingRecipe } from "./types";

export const canCraft = (inventory: Inventory, recipe: CraftingRecipe) =>
  recipe.ingredients.every(({ itemId, quantity }) => inventory.count(itemId) >= quantity);

/** All inputs are checked before changing the inventory. Recipes are trusted definitions. */
export function craft(inventory: Inventory, recipe: CraftingRecipe): boolean {
  if (!canCraft(inventory, recipe)) return false;
  for (const ingredient of recipe.ingredients) inventory.consume(ingredient.itemId, ingredient.quantity);
  inventory.add(recipe.output.itemId, recipe.output.quantity);
  return true;
}
