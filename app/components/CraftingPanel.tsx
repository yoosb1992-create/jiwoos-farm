import { CRAFTING_RECIPES } from "@/game/crafting/definitions";
import { ITEM_DEFINITIONS, type ItemId } from "@/game/data/items";
import { ITEM_ASSETS } from "@/game/assets/definitions";
import { ItemIcon } from "./ItemIcon";
import { TOOL_UPGRADES } from "@/game/tools/definitions";
import type { ToolProgression } from "@/game/tools/types";

export function CraftingPanel({ items, progression = { axe: 1, pickaxe: 0 }, busy, onCraft, onUpgrade = () => {}, onClose }: {
  items: Partial<Record<ItemId, number>>; progression?: ToolProgression; busy: boolean; onCraft: (id: string) => void; onUpgrade?: (id: string) => void; onClose: () => void;
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
    })}
    {Object.values(TOOL_UPGRADES).map(upgrade => {
      const level = progression[upgrade.tool];
      const available = level === upgrade.fromLevel && upgrade.materials.every(m => (items[m.itemId] ?? 0) >= m.quantity);
      return <article key={upgrade.id} className="crafting-recipe">
        <div className="crafting-result"><ItemIcon asset={ITEM_ASSETS[ITEM_DEFINITIONS[upgrade.tool].assetId]} /><div><strong>{upgrade.name}</strong><small>개인 도구 · 현재 {level ? `Lv${level}` : "잠김"} → Lv{upgrade.toLevel}</small></div></div>
        <ul>{upgrade.materials.map(m => <li key={m.itemId} className={(items[m.itemId] ?? 0) < m.quantity ? "missing" : ""}>{ITEM_DEFINITIONS[m.itemId].name} {items[m.itemId] ?? 0}/{m.quantity}</li>)}</ul>
        <button type="button" disabled={busy || !available} onClick={() => onUpgrade(upgrade.id)}>{level !== upgrade.fromLevel ? "완료" : available ? "해금·강화" : "재료 부족"}</button>
      </article>;
    })}</div>
  </section></div>;
}
