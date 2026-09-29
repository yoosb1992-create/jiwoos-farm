import { BUILDING_DEFINITIONS } from "@/game/buildings/definitions";
import { FARM_EXPANSIONS } from "@/game/farm/expansions";
import type { FarmProgress } from "@/game/farm/expansions";
import { ITEM_DEFINITIONS, type ItemId } from "@/game/data/items";

export function BuildingPanel({ money, items, progress, counts = {}, count, busy, notice, onBuild, onExpand, onClose }: {
  money: number; items: Partial<Record<ItemId, number>>; progress: FarmProgress; counts?: Partial<Record<keyof typeof BUILDING_DEFINITIONS, number>>; count?: number; busy: boolean; notice: string;
  onBuild: (id: keyof typeof BUILDING_DEFINITIONS) => void; onExpand: () => void; onClose: () => void;
}) {
  const expansion = FARM_EXPANSIONS.south_plot;
  const costs = (materials: readonly { itemId: ItemId; quantity: number }[], price: number) =>
    <span>{price} G / 보유 {money} G · {materials.map(m => `${ITEM_DEFINITIONS[m.itemId].name} ${m.quantity}개 / 보유 ${items[m.itemId] ?? 0}개`).join(" · ")}</span>;
  return <div className="modal-shade"><section className="building-card" role="dialog" aria-modal="true" aria-label="건설과 농지 확장">
    <header><h2>건설 · 농지 확장</h2><button type="button" disabled={busy} onClick={onClose}>닫기</button></header>
    <p role="status">{notice}</p>
    {Object.values(BUILDING_DEFINITIONS).map(building => <article key={building.id}><strong>{building.name} · {building.footprint.width}×{building.footprint.height}칸</strong><small>건설됨 {counts[building.id] ?? (building.id === "work_shed" ? count ?? 0 : 0)}개 · 즉시 완성{building.animalCapacity ? ` · 동물 ${building.animalCapacity}마리` : ""}</small>
      {costs(building.cost.materials, building.cost.money)}<button type="button" disabled={busy} onClick={() => onBuild(building.id)}>건설 위치 선택</button></article>)}
    <article><strong>{expansion.name} · {progress.unlocked.includes(expansion.id) ? "해금" : "잠김"}</strong>
      <small>농장 남쪽 9~12열, 17~19행 · 가까이에서 확장</small>
      {costs(expansion.materials, expansion.money)}<button type="button" disabled={busy || progress.unlocked.includes(expansion.id)} onClick={onExpand}>농지 확장</button></article>
  </section></div>;
}
