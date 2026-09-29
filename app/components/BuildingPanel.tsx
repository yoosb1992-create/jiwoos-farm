import { BUILDING_DEFINITIONS } from "@/game/buildings/definitions";
import { FARM_EXPANSIONS } from "@/game/farm/expansions";
import type { FarmProgress } from "@/game/farm/expansions";
import { ITEM_DEFINITIONS, type ItemId } from "@/game/data/items";

export function BuildingPanel({ money, items, progress, count, busy, notice, onBuild, onExpand, onClose }: {
  money: number; items: Partial<Record<ItemId, number>>; progress: FarmProgress; count: number; busy: boolean; notice: string;
  onBuild: () => void; onExpand: () => void; onClose: () => void;
}) {
  const building = BUILDING_DEFINITIONS.work_shed, expansion = FARM_EXPANSIONS.south_plot;
  const costs = (materials: readonly { itemId: ItemId; quantity: number }[], price: number) =>
    <span>{price} G / 보유 {money} G · {materials.map(m => `${ITEM_DEFINITIONS[m.itemId].name} ${m.quantity}개 / 보유 ${items[m.itemId] ?? 0}개`).join(" · ")}</span>;
  return <div className="modal-shade"><section className="building-card" role="dialog" aria-modal="true" aria-label="건설과 농지 확장">
    <header><h2>건설 · 농지 확장</h2><button type="button" disabled={busy} onClick={onClose}>닫기</button></header>
    <p role="status">{notice}</p>
    <article><strong>{building.name} · 3×3칸</strong><small>건설된 창고 {count}개 · 즉시 완성</small>
      {costs(building.cost.materials, building.cost.money)}<button type="button" disabled={busy} onClick={onBuild}>건설 위치 선택</button></article>
    <article><strong>{expansion.name} · {progress.unlocked.includes(expansion.id) ? "해금" : "잠김"}</strong>
      <small>농장 남쪽 9~12열, 17~19행 · 가까이에서 확장</small>
      {costs(expansion.materials, expansion.money)}<button type="button" disabled={busy || progress.unlocked.includes(expansion.id)} onClick={onExpand}>농지 확장</button></article>
  </section></div>;
}
