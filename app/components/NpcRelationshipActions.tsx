"use client";
import { useMemo, useState } from "react";
import { ITEM_DEFINITIONS, type ItemId } from "@/game/data/items";

export function NpcRelationshipActions({ items, eventOptions, busy, onGift, onEvent }: {
  items: Partial<Record<ItemId, number>>; eventOptions: readonly { id: string; title: string }[]; busy: boolean;
  onGift: (itemId: ItemId) => void; onEvent: (eventId: string) => void;
}) {
  const giftable = useMemo(() => (Object.keys(ITEM_DEFINITIONS) as ItemId[]).filter(id =>
    (items[id] ?? 0) > 0 && ITEM_DEFINITIONS[id].kind !== "tool"), [items]);
  const [selected, setSelected] = useState<ItemId | "">(giftable[0] ?? "");
  const selectedItem = giftable.includes(selected as ItemId) ? selected as ItemId : giftable[0];
  return <div className="npc-relationship-actions">
    <strong>선물하기</strong>
    <div><select aria-label="선물할 아이템" value={selectedItem ?? ""} disabled={busy || !giftable.length} onChange={event => setSelected(event.target.value as ItemId)}>
      {!giftable.length && <option value="">선물할 아이템 없음</option>}
      {giftable.map(id => <option key={id} value={id}>{ITEM_DEFINITIONS[id].name} · {items[id]}개</option>)}
    </select><button type="button" disabled={busy || !selectedItem} onClick={() => selectedItem && onGift(selectedItem)}>선물</button></div>
    {eventOptions.length > 0 && <section aria-label="관계 이벤트"><strong>관계 이벤트</strong>{eventOptions.map(event =>
      <button type="button" key={event.id} disabled={busy} onClick={() => onEvent(event.id)}>✦ {event.title}</button>)}</section>}
  </div>;
}
