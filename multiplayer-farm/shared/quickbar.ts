import { ITEMS } from "./content.js";

export interface QuickSlot {
  slotId: number;
  /** Origin is bottom-left, independent of rendering order and slot ID. */
  rowFromBottom: number;
  column: number;
  itemId: string | null;
}
export interface Quickbar {
  version: 1;
  rows: number;
  columns: number;
  nextSlotId: number;
  slots: QuickSlot[];
  favorites: string[];
  selectedFavorite: string | null;
}
export type QuickbarEdit =
  | { action: "assign"; slotId: number; itemId: string }
  | { action: "clear"; slotId: number }
  | { action: "favorite-add" | "favorite-remove" | "favorite-select"; itemId: string }
  | { action: "favorite-replace"; itemId: string; previousItemId: string }
  | { action: "favorite-move"; itemId: string; direction: -1 | 1 };
type Owner = { inventory: Record<string,number>; quickbar?: Quickbar };
export const ownedItem = (m: Pick<Owner,"inventory"> | undefined, id: string | null | undefined): boolean =>
  id === "hand" || !!id && !!m && (m.inventory[id] ?? 0) > 0;
export const knownQuickItem = (id: unknown): id is string =>
  typeof id === "string" && (id === "hand" || Object.hasOwn(ITEMS,id));

export function defaultQuickbar(): Quickbar {
  const items = ["hand","hoe","water","axe","pickaxe","scythe","fishing_rod"];
  return {version:1,rows:2,columns:4,nextSlotId:8,
    slots:items.map((itemId,i)=>({slotId:i+1,rowFromBottom:i<3?0:1,column:i<3?i:i-3,itemId})),
    favorites:[],selectedFavorite:null};
}

/** Additive fallback only. Empty slots/lists are intentional user choices. */
export function ensureQuickbar(m: Owner): Quickbar {
  return m.quickbar ??= defaultQuickbar();
}
export function quickbarFor(m: Owner | undefined): Quickbar { return m?.quickbar ?? defaultQuickbar(); }
export const visualSlots = (bar: Quickbar): QuickSlot[] =>
  [...bar.slots].sort((a,b)=>b.rowFromBottom-a.rowFromBottom || a.column-b.column);

/** Future reward hook; not exposed as a player command. Never renumbers slots. */
export function expandQuickbar(bar: Quickbar, rows: number, columns: number): Quickbar {
  if (!Number.isInteger(rows) || !Number.isInteger(columns) || rows<bar.rows || columns<bar.columns || rows>8 || columns>8)
    throw new Error("잘못된 단축슬롯 크기");
  const next = structuredClone(bar); next.rows=rows; next.columns=columns;
  next.nextSlotId=Math.max(next.nextSlotId,...next.slots.map(s=>s.slotId+1));
  for(let row=0;row<rows;row++)for(let column=0;column<columns;column++) {
    if(row===0 && column===columns-1)continue;
    if(next.slots.some(s=>s.rowFromBottom===row && s.column===column))continue;
    next.slots.push({slotId:next.nextSlotId++,rowFromBottom:row,column,itemId:null});
  }
  return next;
}

export function parseQuickbarEdit(value: unknown): QuickbarEdit {
  if (!value || typeof value!=="object" || Array.isArray(value))throw new Error("슬롯 설정 오류");
  const e=value as Record<string,unknown>;
  if(e.action==="assign" || e.action==="clear") {
    if(!Number.isSafeInteger(e.slotId) || Number(e.slotId)<1 || Number(e.slotId)>63)throw new Error("슬롯 번호 오류");
    if(e.action==="clear")return {action:e.action,slotId:Number(e.slotId)};
    if(!knownQuickItem(e.itemId))throw new Error("아이템 오류");
    return {action:e.action,slotId:Number(e.slotId),itemId:e.itemId};
  }
  if(!knownQuickItem(e.itemId))throw new Error("아이템 오류");
  if(e.action==="favorite-add" || e.action==="favorite-remove" || e.action==="favorite-select")return {action:e.action,itemId:e.itemId};
  if(e.action==="favorite-replace" && knownQuickItem(e.previousItemId))return {action:e.action,itemId:e.itemId,previousItemId:e.previousItemId};
  if(e.action==="favorite-move" && (e.direction===-1 || e.direction===1))return {action:e.action,itemId:e.itemId,direction:e.direction};
  throw new Error("즐겨찾기 설정 오류");
}

/** Server-owned delta: the client never writes another player, layout or inventory. */
export function editQuickbar(m: Owner, edit: QuickbarEdit): void {
  const e=parseQuickbarEdit(edit), bar=structuredClone(ensureQuickbar(m));
  if(["assign","favorite-add","favorite-replace","favorite-select"].includes(e.action) &&
      (!('itemId' in e) || !ownedItem(m,e.itemId)))throw new Error("가방에 있는 아이템만 등록하거나 선택할 수 있어요");
  if(e.action==="assign" || e.action==="clear") {
    const slot=bar.slots.find(s=>s.slotId===e.slotId);
    if(!slot)throw new Error("열리지 않은 슬롯입니다");
    slot.itemId=e.action==="clear"?null:e.itemId;
  } else {
    const index=bar.favorites.indexOf(e.itemId);
    switch(e.action) {
      case "favorite-add":
        if(index<0) { if(bar.favorites.length>=24)throw new Error("즐겨찾기는 최대 24개예요"); bar.favorites.push(e.itemId); } break;
      case "favorite-remove":
        if(index>=0)bar.favorites.splice(index,1);
        if(bar.selectedFavorite===e.itemId)bar.selectedFavorite=null; break;
      case "favorite-replace": {
        const old=bar.favorites.indexOf(e.previousItemId);
        if(old<0 || index>=0 && index!==old)throw new Error("이미 등록되었거나 변경할 즐겨찾기가 없어요");
        bar.favorites[old]=e.itemId;
        if(bar.selectedFavorite===e.previousItemId)bar.selectedFavorite=e.itemId; break;
      }
      case "favorite-select":
        if(index<0)throw new Error("등록된 즐겨찾기가 아닙니다");
        bar.selectedFavorite=e.itemId; break;
      case "favorite-move": {
        const target=index+e.direction;
        if(index<0 || target<0 || target>=bar.favorites.length)throw new Error("이동할 위치가 없어요");
        [bar.favorites[index],bar.favorites[target]]=[bar.favorites[target]!,bar.favorites[index]!]; break;
      }
    }
  }
  m.quickbar=bar;
}
