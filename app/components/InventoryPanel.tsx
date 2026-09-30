import { ITEM_ASSETS } from "@/game/assets/definitions";
import { ITEM_DEFINITIONS, type ItemId } from "@/game/data/items";
import { FOOD_DEFINITIONS, isFoodItemId } from "@/game/data/food";
import { ItemIcon } from "./ItemIcon";
import type { PlayerStats } from "@/game/player/stats";
import { SKILL_DEFINITIONS } from "@/game/skills/definitions";
import { nextLevelExperience } from "@/game/skills/progression";
import type { SkillId } from "@/game/skills/types";

const carriedItems = (Object.keys(ITEM_DEFINITIONS) as ItemId[]).filter(id =>
  ["seed", "crop", "resource", "material", "placeable", "fish", "animal_product", "food"].includes(ITEM_DEFINITIONS[id].kind) && id !== "seed");

export function InventoryPanel({ items, stats, notice, onConsume, onClose }: {
  items: Partial<Record<ItemId, number>>;
  stats: PlayerStats;
  notice?: string;
  onConsume: (itemId: ItemId) => void;
  onClose: () => void;
}) {
  const visible = carriedItems.filter(id => (items[id] ?? 0) > 0);
  const stopPointer = (event: React.PointerEvent<HTMLElement>) => event.stopPropagation();
  return <div className="modal-shade game-ui-modal" onPointerDown={stopPointer} onPointerMove={stopPointer} onPointerUp={stopPointer} onPointerCancel={stopPointer}>
    <section className="bag-card" role="dialog" aria-modal="true" aria-label="내 가방">
      <header>
        <div><h2>🎒 내 가방</h2><small>아이템을 확인하고 음식은 바로 사용할 수 있어요.</small></div>
        <button type="button" onPointerDown={stopPointer} onClick={onClose} aria-label="가방 닫기">닫기</button>
      </header>
      <div className="bag-stamina" aria-label="가방 스테미나">
        <span>스테미나</span><strong>{stats.stamina} / {stats.maxStamina}</strong>
        <div className="stamina-track"><i style={{ width: `${stats.maxStamina > 0 ? Math.max(0, Math.min(100, stats.stamina / stats.maxStamina * 100)) : 0}%` }} /></div>
      </div>
      {visible.length ? <ul className="bag-items">{visible.map(id => {
        const item = ITEM_DEFINITIONS[id];
        const food = isFoodItemId(id) ? FOOD_DEFINITIONS[id] : null;
        return <li key={id} className="bag-item-row">
          <ItemIcon asset={ITEM_ASSETS[item.assetId]} size={36} />
          <span><b>{item.name}</b>{food && <small>스테미나 +{food.staminaRestore}</small>}</span>
          <strong>×{items[id]}</strong>
          {food && <button type="button" className="eat-button" onPointerDown={stopPointer} onClick={() => onConsume(id)}
            aria-label={`${item.name} 먹기`}>먹기</button>}
        </li>;
      })}</ul> : <p>가방이 비어 있어요.</p>}
      {notice && <p className="bag-notice" role="status">{notice}</p>}
      <section className="bag-skills" aria-label="내 스킬"><h3>내 스킬</h3><ul>{(Object.keys(SKILL_DEFINITIONS) as SkillId[]).map(id => {
        const skill = stats.skills[id], next = nextLevelExperience(skill.level);
        return <li key={id}><span>{SKILL_DEFINITIONS[id].name} Lv{skill.level}</span><small>경험치 {skill.experience}{next === null ? " · 최고 레벨" : ` / ${next}`}</small></li>;
      })}</ul></section>
    </section>
  </div>;
}
