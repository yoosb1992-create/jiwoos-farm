import { RECIPES } from "./content.js";
import { MAX_QUANTITY } from "./world.js";

export type Recipe = (typeof RECIPES)[string];
export const STACK_LIMIT = 999999;
export function transferQuantity(count: number, mode: "half" | "all"): number {
  return mode === "all" ? count : Math.ceil(count / 2);
}
/** Includes the slot freed by consuming the last ingredient stack. */
export function canCraft(inventory: Record<string, number>, recipe: Recipe, count: number): boolean {
  if (!Number.isSafeInteger(count) || count < 1 || count > MAX_QUANTITY) return false;
  const after = { ...inventory };
  for (const i of recipe.ingredients) {
    const remaining = (after[i.itemId] ?? 0) - i.quantity * count;
    if (remaining < 0) return false;
    if (remaining) after[i.itemId] = remaining;
    else delete after[i.itemId];
  }
  const id = recipe.output.itemId;
  if (!after[id] && Object.keys(after).length >= 48) return false;
  return (after[id] ?? 0) + recipe.output.quantity * count <= STACK_LIMIT;
}
export function maxCrafts(inventory: Record<string, number>, recipe: Recipe): number {
  const max = Math.min(MAX_QUANTITY, ...recipe.ingredients.map(i =>
    Math.floor((inventory[i.itemId] ?? 0) / i.quantity)));
  // At most 999 checks, only on panel refresh; handles a full bag correctly.
  for (let n = max; n > 0; n--) if (canCraft(inventory, recipe, n)) return n;
  return 0;
}
