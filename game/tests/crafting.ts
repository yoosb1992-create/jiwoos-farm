import { strict as assert } from "node:assert";
import { Inventory, normalizeSaveData } from "../domain";
import { ITEM_ASSETS } from "../assets/definitions";
import { ITEM_DEFINITIONS } from "../data/items";
import { CRAFTING_RECIPES, getRecipe } from "../crafting/definitions";
import { canCraft, craft } from "../crafting/engine";

for (const recipe of Object.values(CRAFTING_RECIPES)) {
  assert.ok(recipe.ingredients.length > 0 && recipe.ingredients.every(i => i.quantity > 0));
  assert.ok(recipe.output.quantity > 0 && ITEM_DEFINITIONS[recipe.output.itemId]);
  assert.ok(ITEM_ASSETS[ITEM_DEFINITIONS[recipe.output.itemId].assetId]);
  assert.equal(getRecipe(recipe.id), recipe);
  const inventory = new Inventory({ items: {} });
  assert.equal(craft(inventory, recipe), false, "재료 부족은 인벤토리를 바꾸지 않음");
  for (const ingredient of recipe.ingredients) inventory.add(ingredient.itemId, ingredient.quantity + 1);
  assert.equal(canCraft(inventory, recipe), true);
  assert.equal(craft(inventory, recipe), true);
  assert.equal(inventory.count(recipe.output.itemId), recipe.output.quantity);
  for (const ingredient of recipe.ingredients) assert.equal(inventory.count(ingredient.itemId), 1);
  const save = normalizeSaveData({ version: 4, inventory: inventory.serialize() });
  assert.equal(save?.inventory.items[recipe.output.itemId], recipe.output.quantity, "제작 결과는 기존 SaveData v4에 보존");
}
assert.equal(getRecipe("unknown"), null);
console.log("Crafting recipes: definitions, atomic ingredient checks, outputs and save normalization passed");
