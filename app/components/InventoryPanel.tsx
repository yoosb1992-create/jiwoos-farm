import { ITEM_ASSETS } from "@/game/assets/definitions";
import { ITEM_DEFINITIONS, type ItemId } from "@/game/data/items";
import { ItemIcon } from "./ItemIcon";
import type { PlayerStats } from "@/game/player/stats";
import { SKILL_DEFINITIONS } from "@/game/skills/definitions";
import { nextLevelExperience } from "@/game/skills/progression";
import type { SkillId } from "@/game/skills/types";

const carriedItems = (Object.keys(ITEM_DEFINITIONS) as ItemId[]).filter(id =>
  ["seed", "crop", "resource", "material", "placeable", "fish", "animal_product", "food"].includes(ITEM_DEFINITIONS[id].kind) && id !== "seed");

export function InventoryPanel({ items, stats, notice, onConsume, onClose }: { items: Partial<Record<ItemId, number>>; stats: PlayerStats; notice?: string; onConsume: (itemId: ItemId) => void; onClose: () => void }) {
  const visible = carriedItems.filter(id => (items[id] ?? 0) > 0);
  return <div className="modal-shade"><section className="bag-card" role="dialog" aria-modal="true" aria-label="내 가방">
    <header><h2>🎒 내 가방</h2><button type="button" onClick={onClose} aria-label="가방 닫기">닫기</button></header>
    <p>현재 가지고 있는 아이템</p>
    {visible.length ? <ul className="bag-items">{visible.map(id => {
      const item = ITEM_DEFINITIONS[id];
      return <li key={id}><ItemIcon asset={ITEM_ASSETS[item.assetId]} size={32} /><span>{item.name}</span><strong>×{items[id]}</strong>{item.kind === "food" && <button type="button" className="eat-button" onClick={() => onConsume(id)}>먹기</button>}</li>;
    })}</ul> : <p>가방이 비어 있어요.</p>}
    {notice && <p className="bag-notice" role="status">{notice}</p>}
    <section className="bag-skills" aria-label="내 스킬"><h3>내 스킬</h3><ul>{(Object.keys(SKILL_DEFINITIONS) as SkillId[]).map(id => {
      const skill = stats.skills[id], next = nextLevelExperience(skill.level);
      return <li key={id}><span>{SKILL_DEFINITIONS[id].name} Lv{skill.level}</span><small>경험치 {skill.experience}{next === null ? " · 최고 레벨" : ` / ${next}`}</small></li>;
    })}</ul></section>
  </section></div>;
}
