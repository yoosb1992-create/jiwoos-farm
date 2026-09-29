import { sellAllCrops, type Inventory } from "../domain";
import { FISH_DEFINITIONS } from "../fishing/definitions";
import { ANIMAL_DEFINITIONS } from "../animals/definitions";

/** The basket sells market goods; each content definition retains its price. */
export function sellMarketGoods(inventory: Inventory) {
  const crops = sellAllCrops(inventory);
  let amount = crops.amount, earned = crops.earned;
  for (const fish of Object.values(FISH_DEFINITIONS)) {
    const sold = inventory.sellAll(fish.itemId, fish.sellPrice);
    amount += sold.amount; earned += sold.earned;
  }
  for (const animal of Object.values(ANIMAL_DEFINITIONS)) {
    const sold = inventory.sellAll(animal.produceItemId, animal.produceSellPrice);
    amount += sold.amount; earned += sold.earned;
  }
  return { amount, earned };
}
