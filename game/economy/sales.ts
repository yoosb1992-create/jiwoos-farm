import { sellAllCrops, type Inventory } from "../domain";
import { FISH_DEFINITIONS } from "../fishing/definitions";

/** The basket sells crops and fish; their definitions retain their own prices. */
export function sellMarketGoods(inventory: Inventory) {
  const crops = sellAllCrops(inventory);
  let amount = crops.amount, earned = crops.earned;
  for (const fish of Object.values(FISH_DEFINITIONS)) {
    const sold = inventory.sellAll(fish.itemId, fish.sellPrice);
    amount += sold.amount; earned += sold.earned;
  }
  return { amount, earned };
}
