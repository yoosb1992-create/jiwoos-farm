import { CRAFTING_RECIPES } from "@/game/crafting/definitions";
import { ITEM_DEFINITIONS, type ItemId } from "@/game/data/items";
import { ITEM_ASSETS } from "@/game/assets/definitions";
import { ItemIcon } from "./ItemIcon";

export function CraftingPanel({ items, busy, onCraft, onClose }: {
  items: Partial<Record<ItemId, number>>; busy: boolean; onCraft: (id: string) => void; onClose: () => void;
}) {
  return <div className="modal-shade"><section className="crafting-card" role="dialog" aria-modal="true" aria-label="제작대">
    <header><h2>🛠 제작대</h2><button type="button" onClick={onClose} disabled={busy} aria-label="제작대 닫기">닫기</button></header>
    <p>숲에서 얻은 재료를 가공해요.</p>
    <div className="crafting-list">{Object.values(CRAFTING_RECIPES).map(recipe => {
      const available = recipe.ingredients.every(i => (items[i.itemId] ?? 0) >= i.quantity);
      const output = ITEM_DEFINITIONS[recipe.output.itemId];
      return <article key={recipe.id} className="crafting-recipe">
        <div className="crafting-result"><ItemIcon asset={ITEM_ASSETS[output.assetId]} /><div><strong>{recipe.name} ×{recipe.output.quantity}</strong><small>{recipe.description}</small></div></div>
        <ul>{recipe.ingredients.map(i => <li key={i.itemId} className={(items[i.itemId] ?? 0) < i.quantity ? "missing" : ""}>{ITEM_DEFINITIONS[i.itemId].name} {items[i.itemId] ?? 0}/{i.quantity}</li>)}</ul>
        <button type="button" disabled={busy || !available} onClick={() => onCraft(recipe.id)}>{available ? "제작" : "재료 부족"}</button>
      </article>;
    })}</div>
  </section></div>;
}
