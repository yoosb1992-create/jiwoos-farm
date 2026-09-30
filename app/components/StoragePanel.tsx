import { useMemo, useState } from "react";
import { ITEM_ASSETS } from "@/game/assets/definitions";
import { ITEM_DEFINITIONS, type ItemId } from "@/game/data/items";
import { CONTAINER_DEFINITIONS } from "@/game/storage/definitions";
import { isStorableItemId } from "@/game/storage/container";
import type { ContainerId, StorageData, StorageDirection, StorageTransfer } from "@/game/storage/types";
import { ItemIcon } from "./ItemIcon";

export function StoragePanel({ containerId, storage, items, busy, notice, onCommit, onClose }: {
  containerId: ContainerId;
  storage: StorageData;
  items: Partial<Record<ItemId, number>>;
  busy: boolean;
  notice?: string;
  onCommit: (transfers: StorageTransfer[]) => void;
  onClose: () => void;
}) {
  const container = storage.containers[containerId];
  const definition = CONTAINER_DEFINITIONS[containerId];
  const [quantities, setQuantities] = useState<Partial<Record<ItemId, string>>>({});
  const [deltas, setDeltas] = useState<Partial<Record<ItemId, number>>>({});
  const allIds = useMemo(() => (Object.keys(ITEM_DEFINITIONS) as ItemId[]).filter(isStorableItemId), []);
  const bagCount = (id: ItemId) => Math.max(0, (items[id] ?? 0) - (deltas[id] ?? 0));
  const chestCount = (id: ItemId) => Math.max(0, (container.items[id] ?? 0) + (deltas[id] ?? 0));
  const visible = allIds.filter(id => bagCount(id) > 0 || chestCount(id) > 0 || Boolean(deltas[id]));
  const occupied = allIds.filter(id => chestCount(id) > 0).length;
  const dirty = Object.values(deltas).some(value => Boolean(value));
  const stopPointer = (event: React.PointerEvent<HTMLElement>) => event.stopPropagation();

  const requested = (id: ItemId) => {
    const value = Number(quantities[id] ?? "1");
    return Number.isSafeInteger(value) && value > 0 ? value : 1;
  };
  const stage = (direction: StorageDirection, id: ItemId, all = false) => {
    const current = deltas[id] ?? 0;
    const available = direction === "deposit" ? bagCount(id) : chestCount(id);
    const amount = Math.min(available, all ? available : requested(id));
    if (amount <= 0) return;
    const next = current + (direction === "deposit" ? amount : -amount);
    setDeltas(previous => ({ ...previous, [id]: next || undefined }));
  };
  const resetDraft = () => { setDeltas({}); setQuantities({}); };
  const confirm = () => {
    const transfers = Object.entries(deltas).flatMap(([itemId, delta]) => {
      const value = delta ?? 0;
      if (!value) return [];
      return [{
        direction: value > 0 ? "deposit" : "withdraw",
        itemId: itemId as ItemId,
        quantity: Math.abs(value),
      } satisfies StorageTransfer];
    });
    if (!transfers.length) return;
    onCommit(transfers);
    resetDraft();
  };

  return <div className="modal-shade game-ui-modal" onPointerDown={stopPointer} onPointerMove={stopPointer} onPointerUp={stopPointer} onPointerCancel={stopPointer}>
    <section className="storage-card" role="dialog" aria-modal="true" aria-label={definition.name}>
      <header><div><h2>🎒 내 가방 · {definition.name}</h2><small>수량을 먼저 정한 뒤 마지막에 확인하세요.</small></div><button type="button" disabled={busy} onPointerDown={stopPointer} onClick={onClose}>닫기</button></header>
      <p>미리보기 {occupied} / {definition.capacity}종류 · <b>확인 전에는 실제 저장에 반영되지 않습니다.</b></p>
      {notice && <p role="status" className="storage-notice">{notice}</p>}
      <div className="storage-head"><span>아이템</span><span>가방</span><span>{definition.name}</span></div>
      {visible.length ? <ul className="storage-list">{visible.map(id => <li key={id}>
        <div className="storage-item"><ItemIcon asset={ITEM_ASSETS[ITEM_DEFINITIONS[id].assetId]} size={30} /><span>{ITEM_DEFINITIONS[id].name}</span></div>
        <strong>{bagCount(id)}</strong><strong>{chestCount(id)}</strong>
        <label className="storage-row-quantity">수량
          <input aria-label={`${ITEM_DEFINITIONS[id].name} 이동 수량`} type="number" inputMode="numeric" min="1" step="1"
            value={quantities[id] ?? "1"} onChange={event => setQuantities(previous => ({ ...previous, [id]: event.target.value }))} />
        </label>
        <div className="storage-buttons">
          <button type="button" disabled={busy || bagCount(id) <= 0} onClick={() => stage("deposit", id)}>넣기</button>
          <button type="button" disabled={busy || bagCount(id) <= 0} onClick={() => stage("deposit", id, true)}>전부 넣기</button>
          <button type="button" disabled={busy || chestCount(id) <= 0} onClick={() => stage("withdraw", id)}>꺼내기</button>
          <button type="button" disabled={busy || chestCount(id) <= 0} onClick={() => stage("withdraw", id, true)}>전부 꺼내기</button>
        </div>
        {(deltas[id] ?? 0) !== 0 && <small className="storage-draft">{(deltas[id] ?? 0) > 0 ? `보관함으로 +${deltas[id]}` : `가방으로 +${Math.abs(deltas[id] ?? 0)}`}</small>}
      </li>)}</ul> : <p>가방과 보관함에 아이템이 없어요.</p>}
      <footer className="storage-footer">
        <button type="button" disabled={busy || !dirty} onClick={resetDraft}>변경 취소</button>
        <button type="button" className="storage-confirm" disabled={busy || !dirty} onClick={confirm}>{busy ? "반영 중…" : "확인 · 변경사항 반영"}</button>
      </footer>
    </section>
  </div>;
}
