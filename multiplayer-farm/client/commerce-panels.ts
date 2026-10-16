import { CROPS, ITEMS, itemName } from "../shared/content.js";
import { TREE_SPECIES } from "../shared/nature.js";
import { DECORATIONS, calendar, SEASON_INFO } from "../shared/expansion.js";
import { purchasePrice, type TransactionRequest } from "../shared/transactions.js";
import type { Member } from "../shared/world.js";
import { itemIconSource } from "./item-icons.js";
interface Context { member?:Member; day:number; targetId?:string; open:(r:TransactionRequest)=>void; report:()=>void }
const node=(tag:string,text="",cls="")=>{const n=document.createElement(tag);n.textContent=text;n.className=cls;return n;};
export function renderCommerce(type:string,body:HTMLElement,c:Context):boolean {
  if(!["shop","shipping","shipping-report"].includes(type))return false;
  const m=c.member;if(!m){body.append(node("p","가방 정보를 불러오는 중이에요"));return true;}
  const row=(id:string,text:string,label:string,r:TransactionRequest)=>{
    const card=node("article","","commerce-item");card.dataset.item=id;card.dataset.scrollKey=`${r.type}-${r.shipmentId??id}`;
    const heading=node("div","","household-item-heading"),image=document.createElement("img");
    const source=itemIconSource(id);if(source){image.src=source;image.alt="";image.loading="lazy";heading.append(image);}
    heading.append(node("strong",itemName(id)),node("span",text));
    const button=document.createElement("button");button.textContent=label;button.onclick=()=>c.open(r);
    card.append(heading,button);body.append(card);
  };
  const report=m.shipping?.reports.at(-1);
  if(type==="shipping-report"){
    body.append(node("h3",report?`${report.day}일 아침 · 출하 정산 완료`:"아직 정산 내역이 없어요"));
    for(const lot of report?.lines??[])body.append(node("p",`${itemName(lot.itemId)} · ${lot.quantity}개 × ${lot.unitPrice} G = ${(lot.quantity*lot.unitPrice).toLocaleString()} G`));
    if(report)body.append(node("h3",`총 ${report.total.toLocaleString()} G 지급 완료`),node("p",`현재 골드 ${m.money.toLocaleString()} G · 최근 30회 정산 내역은 농장 데이터에 보관돼요.`));
    return true;
  }
  if(type==="shop"){
    const season=calendar(c.day).season;
    body.append(node("h3",`${SEASON_INFO[season].name} 장터 · ${m.money.toLocaleString()} G`));
    const ids=[...Object.values(CROPS).filter(x=>x.seasons.includes(season)).map(x=>x.seedItemId),...TREE_SPECIES.filter(t=>t.seedPrice>0).map(t=>t.seed),"stamina_biscuit","animal_feed","herb_tea","harvest_stew",...Object.keys(DECORATIONS)];
    for(const id of [...new Set(ids)])row(id,`보유 ${m.inventory[id]??0}개 · 개당 ${purchasePrice(id,c.day)} G`,"구매 수량 선택",{type:"buyItem",itemId:id});
    body.append(node("h3","수확물 즉시 판매"));
  }else{
    body.append(node("p","출하한 물품은 다음 날 아침에 정산돼요. 잠자기 전에는 본인이 넣은 물품만 회수할 수 있어요.","household-note"));
    if(report){const b=document.createElement("button");b.textContent=`최근 정산 내역 · ${report.total.toLocaleString()} G`;b.onclick=c.report;body.append(b);}
    body.append(node("h3","내 출하 대기 목록"));
    const pending=m.shipping?.pending??[];
    if(!pending.length)body.append(node("p","아직 출하한 물품이 없어요."));
    for(const lot of pending)row(lot.itemId,`${lot.quantity}개 · 개당 ${lot.unitPrice} G · 예정 ${(lot.quantity*lot.unitPrice).toLocaleString()} G`,"회수 수량 선택",{type:"withdrawShipment",itemId:lot.itemId,shipmentId:lot.id,targetId:c.targetId});
    body.append(node("p",`정산 예정 합계: ${pending.reduce((sum,s)=>sum+s.quantity*s.unitPrice,0).toLocaleString()} G`),node("h3","가방에서 출하하기"));
  }
  const sale=Object.entries(m.inventory).filter(([id,n])=>n>0&&(ITEMS[id]?.sellPrice??0)>0);
  if(!sale.length)body.append(node("p","판매 가능한 물품이 없어요."));
  for(const [id,count] of sale)row(id,`보유 ${count}개 · 개당 ${ITEMS[id]!.sellPrice} G`,type==="shop"?"판매 수량 선택":"출하 수량 선택",{type:type==="shop"?"sellItem":"shipItem",itemId:id,targetId:c.targetId});
  return true;
}
