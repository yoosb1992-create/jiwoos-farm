import { ANIMAL_DEFINITIONS } from "@/game/animals/definitions";
import type { RanchState } from "@/game/animals/types";
import { BUILDING_DEFINITIONS } from "@/game/buildings/definitions";
import type { ItemId } from "@/game/data/items";

export function RanchPanel({ homeBuildingId, ranch, daySerial, money, items, busy, notice, onBuy, onFeed, onPet, onCollect, onClose }: {
  homeBuildingId: string; ranch: RanchState; daySerial: number; money: number; items: Partial<Record<ItemId, number>>;
  busy: boolean; notice: string; onBuy: () => void; onFeed: () => void; onPet: (id: string) => void; onCollect: (id: string) => void; onClose: () => void;
}) {
  const residents = ranch.animals.filter(a => a.homeBuildingId === homeBuildingId), chicken = ANIMAL_DEFINITIONS.chicken;
  const capacity = BUILDING_DEFINITIONS.chicken_coop.animalCapacity ?? 0;
  return <div className="modal-shade"><section className="building-card ranch-card" role="dialog" aria-modal="true" aria-label="닭장 관리">
    <header><h2>🐔 닭장</h2><button type="button" disabled={busy} onClick={onClose}>닫기</button></header>
    <p role="status">{notice}</p>
    <article><strong>닭 {residents.length} / {capacity}</strong><small>공동 자금 {money} G · 동물 먹이 {items.animal_feed ?? 0}개</small>
      <div><button type="button" disabled={busy || residents.length >= capacity || money < chicken.purchasePrice} onClick={onBuy}>닭 구입 · {chicken.purchasePrice} G</button>
      <button type="button" disabled={busy || !residents.some(a => a.lastFedDaySerial !== daySerial)} onClick={onFeed}>먹이 공급</button></div></article>
    {residents.length === 0 ? <p>닭을 구입하면 이곳에서 함께 돌볼 수 있어요.</p> : residents.map(animal => <article key={animal.id}>
      <strong>{animal.name}</strong><small>{animal.lastFedDaySerial === daySerial ? "먹음" : "배고픔"} · {animal.lastPettedDaySerial === daySerial ? "오늘 쓰다듬음" : "돌봄 가능"} · 친밀도 {animal.friendship} / {chicken.friendshipMax}</small>
      <small>{animal.produceReady ? "🥚 달걀 준비됨" : "생산물 없음"}</small><div>
        <button type="button" disabled={busy || animal.lastPettedDaySerial === daySerial} onClick={() => onPet(animal.id)}>쓰다듬기</button>
        <button type="button" disabled={busy || !animal.produceReady} onClick={() => onCollect(animal.id)}>달걀 받기</button>
      </div></article>)}
  </section></div>;
}
