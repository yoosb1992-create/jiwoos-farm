import { ITEM_DEFINITIONS, type ItemId } from "@/game/data/items";
import { MACHINE_PROCESSES } from "@/game/machines/definitions";
import type { PlaceableInstance } from "@/game/placeables/types";

export function MachinePanel({ instance, now, items, busy, notice, onStart, onCollect, onRemove, onClose }: {
  instance: PlaceableInstance; now: number; items: Partial<Record<ItemId, number>>; busy: boolean; notice?: string;
  onStart: () => void; onCollect: () => void; onRemove: () => void; onClose: () => void;
}) {
  const machine = instance.state.machine, process = MACHINE_PROCESSES.saw_wood;
  const remaining = machine.status === "processing" ? Math.max(0, (machine.completesAt ?? now) - now) : 0;
  return <div className="modal-shade"><section className="machine-card" role="dialog" aria-modal="true" aria-label="목재 가공기">
    <header><h2>⚙ 목재 가공기</h2><button type="button" disabled={busy} onClick={onClose}>닫기</button></header>
    {notice && <p role="status">{notice}</p>}
    <p>{machine.status === "idle" ? "비어 있음" : machine.status === "ready" ? "완료됨 · 목재판을 받을 수 있어요." : `가공 중 · 게임 시간 약 ${remaining}분 남음`}</p>
    <p>{ITEM_DEFINITIONS[process.input.itemId].name} {process.input.quantity}개 → {ITEM_DEFINITIONS[process.output.itemId].name} {process.output.quantity}개 · {process.durationMinutes}분</p>
    {machine.status === "idle" && <button type="button" disabled={busy || (items[process.input.itemId] ?? 0) < process.input.quantity} onClick={onStart}>
      재료 넣기 · 보유 {items[process.input.itemId] ?? 0}/{process.input.quantity}
    </button>}
    {machine.status === "ready" && <button type="button" disabled={busy} onClick={onCollect}>결과물 받기</button>}
    {machine.status === "idle" && <button type="button" disabled={busy} onClick={onRemove}>기계 회수</button>}
  </section></div>;
}
