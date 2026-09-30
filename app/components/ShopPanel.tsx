import { ITEM_ASSETS } from "@/game/assets/definitions";
import { ITEM_DEFINITIONS, type ItemId } from "@/game/data/items";
import { GENERAL_STORE_LISTINGS } from "@/game/data/shop";
import { ItemIcon } from "./ItemIcon";

export function ShopPanel({ money, items, notice, onBuy, onClose }: {
  money: number;
  items: Partial<Record<ItemId, number>>;
  notice?: string;
  onBuy: (listingId: string) => void;
  onClose: () => void;
}) {
  const stopPointer = (event: React.PointerEvent<HTMLElement>) => event.stopPropagation();
  return <div className="modal-shade game-ui-modal" onPointerDown={stopPointer} onPointerMove={stopPointer} onPointerUp={stopPointer} onPointerCancel={stopPointer}>
    <section className="shop-card" role="dialog" aria-modal="true" aria-label="새봄 상점">
      <header>
        <div><h2>🌱 새봄 상점</h2><small>현재 소지금 <b>{money.toLocaleString()} G</b></small></div>
        <button type="button" onPointerDown={stopPointer} onClick={onClose}>나가기</button>
      </header>
      <ul className="shop-list">{GENERAL_STORE_LISTINGS.map((listing) => {
        const item = ITEM_DEFINITIONS[listing.itemId];
        const affordable = money >= listing.price;
        return <li key={listing.id}>
          <ItemIcon asset={ITEM_ASSETS[item.assetId]} size={36} />
          <span><b>{listing.name}</b><small>보유 {items[listing.itemId] ?? 0}개 · {listing.quantity}개 구매</small></span>
          <strong>{listing.price} G</strong>
          <button type="button" disabled={!affordable} onPointerDown={stopPointer} onClick={() => onBuy(listing.id)}>
            {affordable ? "구매" : "돈 부족"}
          </button>
        </li>;
      })}</ul>
      {notice && <p className="shop-notice" role="status">{notice}</p>}
    </section>
  </div>;
}
