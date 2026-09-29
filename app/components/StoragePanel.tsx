import { useState } from "react";
import { ITEM_ASSETS } from "@/game/assets/definitions";
import { ITEM_DEFINITIONS, type ItemId } from "@/game/data/items";
import { CONTAINER_DEFINITIONS } from "@/game/storage/definitions";
import { isStorableItemId } from "@/game/storage/container";
import type { ContainerId, StorageData, StorageDirection } from "@/game/storage/types";
import { ItemIcon } from "./ItemIcon";

export function StoragePanel({ containerId, storage, items, busy, notice, onTransfer, onClose }: {
  containerId: ContainerId; storage: StorageData; items: Partial<Record<ItemId, number>>; busy: boolean; notice?: string;
  onTransfer: (direction: StorageDirection, itemId: ItemId, quantity: number) => void; onClose: () => void;
}) {
  const [quantity, setQuantity] = useState("1");
  const container = storage.containers[containerId];
  const definition = CONTAINER_DEFINITIONS[containerId];
  const occupied = Object.values(container.items).filter(n => n > 0).length;
  const visible = (Object.keys(ITEM_DEFINITIONS) as ItemId[]).filter(id => isStorableItemId(id) && ((items[id] ?? 0) > 0 || (container.items[id] ?? 0) > 0));
  const move = (direction: StorageDirection, id: ItemId, all = false) =>
    onTransfer(direction, id, all ? direction === "deposit" ? items[id] ?? 0 : container.items[id] ?? 0 : Number(quantity));
  return <div className="modal-shade"><section className="storage-card" role="dialog" aria-modal="true" aria-label={definition.name}>
    <header><h2>🎒 내 가방 · {definition.name}</h2><button type="button" disabled={busy} onClick={onClose}>닫기</button></header>
    <p>보관함 {occupied} / {definition.capacity}종류 · 같은 아이템은 한 칸에 쌓입니다.</p>
    {notice && <p role="status">{notice}</p>}
    <label className="storage-quantity">이동 수량 <input aria-label="이동 수량" type="number" inputMode="numeric" min="1" step="1" value={quantity} onChange={event => setQuantity(event.target.value)} /></label>
    <div className="storage-head"><span>아이템</span><span>내 가방</span><span>{definition.name}</span></div>
    {visible.length ? <ul className="storage-list">{visible.map(id => <li key={id}>
      <div className="storage-item"><ItemIcon asset={ITEM_ASSETS[ITEM_DEFINITIONS[id].assetId]} size={28} />{ITEM_DEFINITIONS[id].name}</div>
      <strong>{items[id] ?? 0}</strong><strong>{container.items[id] ?? 0}</strong>
      <div className="storage-buttons"><button type="button" disabled={busy || !(items[id] ?? 0)} onClick={() => move("deposit", id)}>넣기</button><button type="button" disabled={busy || !(items[id] ?? 0)} onClick={() => move("deposit", id, true)}>전부 넣기</button><button type="button" disabled={busy || !(container.items[id] ?? 0)} onClick={() => move("withdraw", id)}>꺼내기</button><button type="button" disabled={busy || !(container.items[id] ?? 0)} onClick={() => move("withdraw", id, true)}>전부 꺼내기</button></div>
    </li>)}</ul> : <p>가방과 보관함에 아이템이 없어요.</p>}
  </section></div>;
}
