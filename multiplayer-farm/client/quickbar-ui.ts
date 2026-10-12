import { ITEMS, itemName } from "../shared/content.js";
import { ownedItem, quickbarFor, visualSlots, type QuickbarEdit } from "../shared/quickbar.js";
import type { Member } from "../shared/world.js";
import { BAG_CATEGORIES, itemCategory, type BagCategory } from "../shared/item-categories.js";
import { itemIconSource } from "./item-icons.js";

const name = (id: string) => id==="hand"?"손":itemName(id);
const node = <K extends keyof HTMLElementTagNameMap>(tag:K,text="",cls="") => {
  const e=document.createElement(tag);e.textContent=text;e.className=cls;return e;
};
const button = (text:string,fn:()=>void,disabled=false) => {
  const b=node("button",text);b.type="button";b.disabled=disabled;b.onclick=fn;return b;
};
export function quickItemIcon(id: string): HTMLElement {
  const src=itemIconSource(id);
  if(!src)return node("span",id==="hand"?"손":name(id).slice(0,2),"item-fallback");
  const img=node("img","","tool-icon");img.src=src;img.alt="";img.draggable=false;return img;
}
export const favoriteMode = () => localStorage.getItem("farm-favorite-mode")==="vertical"?"vertical":"expanded";
export function favoriteModeControls(): HTMLElement {
  const wrap=node("div","","favorite-mode-control");
  wrap.append(node("strong","즐겨찾기 표시 방식"));
  for(const [mode,label] of [["expanded","펼쳐보기"],["vertical","세로형"]]) {
    const b=button(label!,()=>{
      localStorage.setItem("farm-favorite-mode",mode!);
      for(const other of document.querySelectorAll<HTMLElement>(".favorite-mode-control button"))
        other.setAttribute("aria-pressed",String(other.dataset.favoriteMode===mode));
      window.dispatchEvent(new Event("favorite-mode-change"));
    });
    b.dataset.favoriteMode=mode;
    b.setAttribute("aria-pressed",String(favoriteMode()===mode));wrap.append(b);
  }
  return wrap;
}
interface Context {
  member(): Member | undefined;
  selected(): string;
  select(id:string): void;
  edit(e:QuickbarEdit): void;
  open(type:string,title:string): void;
  close(): void;
  pause(): void;
}
type Picker = {slotId:number} | {favorite:true;previous?:string};
export class QuickbarUI {
  private signature="";
  private choice?: Picker;
  private item="hand";
  private category:BagCategory="all";
  private popup=node("div","","favorite-popup");
  constructor(private c:Context) {
    this.popup.id="favorite-popup";this.popup.hidden=true;this.popup.setAttribute("role","region");
    this.popup.setAttribute("aria-label","즐겨찾기 선택");document.body.append(this.popup);
    document.addEventListener("pointerdown",e=>{
      if(!(e.target as HTMLElement).closest("#favorite-popup, #favorite-toggle"))this.closeFavorites();
    });
    window.addEventListener("resize",()=>requestAnimationFrame(()=>this.positionPopup()));
    window.visualViewport?.addEventListener("resize",()=>requestAnimationFrame(()=>this.positionPopup()));
    window.addEventListener("favorite-mode-change",()=>this.renderFavorites());
    window.addEventListener("keydown",e=>{if(e.key==="Escape")this.closeFavorites();});
  }
  private open(type:string,title:string) {this.closeFavorites();this.c.open(type,title);}
  private apply(e:QuickbarEdit) { this.c.edit(e); }
  openSlots(id:string) {this.item=id;this.open("quickbar-slots",`${name(id)} · 단축슬롯 등록`);}
  openManager() {this.open("quickbar-manage","단축슬롯 · 즐겨찾기 관리");}
  openPicker(choice:Picker) {
    this.choice=choice;this.category="all";
    this.open("quickbar-picker","slotId" in choice?`${choice.slotId}번 슬롯에 등록`:"즐겨찾기 아이템 선택");
  }
  closeFavorites() {
    const wasOpen=!this.popup.hidden;this.popup.hidden=true;
    document.getElementById("favorite-toggle")?.setAttribute("aria-expanded","false");
    if(wasOpen)window.dispatchEvent(new Event("favorite-visibility"));
  }
  refresh() {
    const m=this.c.member(),bar=quickbarFor(m),selected=this.c.selected();
    const signature=JSON.stringify([m?.id,bar,m?.inventory,selected]);
    if(signature===this.signature)return;this.signature=signature;
    const root=document.getElementById("quickslots")!;root.replaceChildren();
    root.style.gridTemplateColumns=`repeat(${bar.columns},44px)`;
    root.style.gridTemplateRows=`repeat(${bar.rows},44px)`;
    for(const s of visualSlots(bar)) {
      const available=ownedItem(m,s.itemId),id=available?s.itemId:null;
      const b=button("",()=>id?this.c.select(id):this.openPicker({slotId:s.slotId}));
      b.dataset.slotId=String(s.slotId);b.dataset.tool=id??"";
      b.style.gridRow=String(bar.rows-s.rowFromBottom);b.style.gridColumn=String(s.column+1);
      b.classList.toggle("selected",id===selected);b.setAttribute("aria-pressed",String(id===selected));
      b.title=b.ariaLabel=`${s.slotId}번 · ${id?name(id):"빈 슬롯 · 아이템 등록"}`;
      b.append(node("small",String(s.slotId),"slot-number"),id?quickItemIcon(id):node("span","+","slot-empty"));root.append(b);
    }
    const star=button("",()=>{
      this.c.pause();this.popup.hidden=!this.popup.hidden;
      star.setAttribute("aria-expanded",String(!this.popup.hidden));this.renderFavorites();
      window.dispatchEvent(new Event("favorite-visibility"));
    });
    star.id="favorite-toggle";star.ariaLabel="즐겨찾기 전환";star.title="즐겨찾기";
    star.style.gridRow=String(bar.rows);star.style.gridColumn=String(bar.columns);
    star.setAttribute("aria-expanded",String(!this.popup.hidden));star.setAttribute("aria-controls",this.popup.id);
    const active=bar.selectedFavorite;
    if(active && ownedItem(m,active))star.append(quickItemIcon(active));
    star.append(node("span","★",active && ownedItem(m,active)?"favorite-star badge":"favorite-star"));root.append(star);
    this.renderFavorites();
  }
  private renderFavorites() {
    const m=this.c.member(),bar=quickbarFor(m),scroll=this.popup.scrollTop;
    this.popup.dataset.mode=favoriteMode();this.popup.replaceChildren();
    if(!bar.favorites.length) {
      this.popup.append(node("p","즐겨찾기가 비어 있어요"),button("아이템 등록",()=>this.openPicker({favorite:true})));
    } else for(const id of bar.favorites) {
      const owned=ownedItem(m,id),b=button("",()=>{
        this.apply({action:"favorite-select",itemId:id});this.c.select(id);this.closeFavorites();
      },!owned);
      b.ariaLabel=`${name(id)}${owned?" 선택":" · 미보유"}`;b.title=b.ariaLabel;
      b.append(owned?quickItemIcon(id):node("span","—"),node("small",name(id)));
      b.classList.toggle("selected",id===bar.selectedFavorite);this.popup.append(b);
    }
    this.popup.append(button("관리",()=>this.openManager()),button("닫기",()=>this.closeFavorites()));
    this.popup.scrollTop=scroll;this.positionPopup();
  }
  positionPopup() {
    if(this.popup.hidden)return;
    const viewport=window.visualViewport,w=viewport?.width??innerWidth,h=viewport?.height??innerHeight;
    const tray=document.getElementById("toolbar")!.getBoundingClientRect(),star=document.getElementById("favorite-toggle")!.getBoundingClientRect();
    const top=document.getElementById("top")!.getBoundingClientRect();
    const space=Math.max(54,tray.top-Math.max(8,top.bottom+8)-8);
    const compact=space<145;
    const width=Math.min(compact?tray.width:favoriteMode()==="vertical"?72:Math.max(tray.width,224),w-16);
    const height=Math.min(space,compact?62:favoriteMode()==="vertical"?316:240);
    this.popup.dataset.compact=String(compact);
    // Both modes share the same anchor. No viewport-wide vacant-space search:
    // this is always directly above the tray, aligned with its star column.
    Object.assign(this.popup.style,{left:`${Math.max(8,Math.min(w-width-8,star.right-width))}px`,top:"auto",bottom:`${h-tray.top+8}px`,width:`${width}px`,maxHeight:`${height}px`});
    this.popup.style.setProperty("--favorite-anchor",`${Math.min(width-12,star.width/2)}px`);
  }
  renderPanel(type:string,body:HTMLElement):boolean {
    if(!type.startsWith("quickbar-"))return false;
    const m=this.c.member();if(!m)return true;
    const bar=quickbarFor(m);
    if(type==="quickbar-slots") {
      body.append(node("p",`${name(this.item)} · 등록할 번호를 선택하세요. 가방 수량은 그대로 유지돼요.`));
      const grid=node("div","","slot-assignment-grid");grid.style.gridTemplateColumns=`repeat(${bar.columns},minmax(0,1fr))`;
      for(const s of visualSlots(bar)) {
        const b=button(`${s.slotId}번\n${s.itemId?name(s.itemId):"비어 있음"}`,()=>{
          this.apply({action:"assign",slotId:s.slotId,itemId:this.item});this.open("bag","가방");
        },!ownedItem(m,this.item));
        b.style.gridRow=String(bar.rows-s.rowFromBottom);b.style.gridColumn=String(s.column+1);grid.append(b);
      }
      body.append(grid,button("취소",()=>this.open("bag","가방")));return true;
    }
    if(type==="quickbar-picker") {
      const nav=node("nav","","bag-categories");nav.dataset.scroll="picker-categories";
      for(const [id,label] of BAG_CATEGORIES) {
        const b=button(label,()=>{this.category=id;this.c.open(type,"아이템 선택");});
        b.setAttribute("aria-pressed",String(this.category===id));nav.append(b);
      }
      body.append(nav,button("취소",()=>this.c.close()));
      const grid=node("div","","quick-item-grid");
      for(const id of ["hand",...Object.keys(m.inventory).filter(id=>ownedItem(m,id)&&ITEMS[id])]) {
        if(this.category!=="all" && itemCategory(id)!==this.category)continue;
        const b=button("",()=>{
          if(!this.choice)return;
          this.apply("slotId" in this.choice?{action:"assign",slotId:this.choice.slotId,itemId:id}:
            this.choice.previous?{action:"favorite-replace",previousItemId:this.choice.previous,itemId:id}:{action:"favorite-add",itemId:id});
          this.c.close();
        });b.append(quickItemIcon(id),node("span",name(id)));grid.append(b);
      }
      if(!grid.childElementCount)grid.append(node("p","이 카테고리에 보유한 아이템이 없어요."));
      body.append(grid);return true;
    }
    body.append(node("h3","단축슬롯 · 아래쪽 1번부터"));
    for(const s of [...bar.slots].sort((a,b)=>a.slotId-b.slotId)) {
      const row=node("div","","quick-manager-row");
      row.append(node("span",`${s.slotId}번 · ${s.itemId?`${name(s.itemId)}${ownedItem(m,s.itemId)?"":" (미보유)"}`:"비어 있음"}`),
        button(s.itemId?"변경":"등록",()=>this.openPicker({slotId:s.slotId})),
        button("등록 제거",()=>this.apply({action:"clear",slotId:s.slotId}),!s.itemId));body.append(row);
    }
    body.append(node("h3","즐겨찾기 순서"),button("즐겨찾기 등록",()=>this.openPicker({favorite:true})));
    if(!bar.favorites.length)body.append(node("p","등록된 즐겨찾기가 없어요."));
    bar.favorites.forEach((id,i)=>{
      const row=node("div","","quick-manager-row");row.dataset.scrollKey=`favorite-${id}`;
      row.append(node("span",`${i+1}. ${name(id)}${ownedItem(m,id)?"":" (미보유)"}`),
        button("변경",()=>this.openPicker({favorite:true,previous:id})),
        button("제거",()=>this.apply({action:"favorite-remove",itemId:id})),
        button("↑",()=>this.apply({action:"favorite-move",itemId:id,direction:-1}),i===0),
        button("↓",()=>this.apply({action:"favorite-move",itemId:id,direction:1}),i===bar.favorites.length-1));body.append(row);
    });
    body.append(button("가방으로",()=>this.open("bag","가방")));return true;
  }
}
