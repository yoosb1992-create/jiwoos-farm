import { itemName } from "../shared/content.js";
import { parseQuantity, transactionQuote, transactionLabels, type TransactionRequest } from "../shared/transactions.js";
import type { ActionResult, Member } from "../shared/world.js";
import { itemIconSource } from "./item-icons.js";

interface Context { member?: Member; day: number; chest?: Record<string, number>; capacity?: number; ready: boolean; busy: boolean }
export class QuantityDialog {
  readonly node = document.createElement("dialog");
  private request?: TransactionRequest;
  private actionId?: string;
  private input!: HTMLInputElement;
  private summary!: HTMLElement;
  private limit!: HTMLElement;
  private error!: HTMLElement;
  private confirm!: HTMLButtonElement;
  private controls: HTMLButtonElement[] = [];
  constructor(private context: (request: TransactionRequest) => Context,
    private send: (request: TransactionRequest, quantity: number) => string | undefined) {
    this.node.id = "quantity-dialog";
    this.node.className = "quantity-dialog";
    this.node.setAttribute("aria-label", "수량 선택");
    document.body.append(this.node);
    this.node.addEventListener("cancel", event => { event.preventDefault(); if (!this.actionId) this.close(); });
  }
  close(): void { this.node.close(); this.request = undefined; this.actionId = undefined; }
  open(request: TransactionRequest): void {
    if (this.actionId) return;
    this.request = request;
    this.node.replaceChildren(); this.controls = [];
    const heading = document.createElement("h2"); heading.textContent = `${transactionLabels[request.type]} · 수량 선택`;
    const item = document.createElement("p"); item.className = "quantity-item";
    const source = itemIconSource(request.itemId);
    if (source) { const image = document.createElement("img"); image.src=source; image.alt=""; item.append(image); }
    item.append(document.createTextNode(itemName(request.itemId)));
    this.limit = document.createElement("p"); this.limit.className="household-note";
    const controls = document.createElement("div"); controls.className="quantity-stepper";
    const makeButton = (label: string, fn: () => void) => {
      const b = document.createElement("button"); b.type="button"; b.textContent=label; b.onclick=fn; this.controls.push(b); return b;
    };
    this.input = document.createElement("input");
    this.input.type="text"; this.input.inputMode="numeric"; this.input.pattern="[0-9]*"; this.input.autocomplete="off";
    this.input.setAttribute("aria-label",request.type==="craftItem"?"제작 횟수":"선택 수량");
    this.input.value=String(request.initial ?? 1);
    this.input.oninput=()=>this.refresh();
    const adjust=(delta:number)=>{ const n=parseQuantity(this.input.value)??0; this.input.value=String(Math.max(1,Math.min(this.max(),n+delta))); this.refresh(); };
    controls.append(makeButton("−10",()=>adjust(-10)),makeButton("−1",()=>adjust(-1)),this.input,makeButton("+1",()=>adjust(1)),makeButton("+10",()=>adjust(10)));
    const quick=document.createElement("div"); quick.className="quantity-quick";
    for(const [label,value] of [["1개",1],["5개",5],["10개",10],["절반",-1],["최대",-2]] as const)
      quick.append(makeButton(label,()=>{this.input.value=String(value===-1?Math.ceil(this.max()/2):value===-2?this.max():value);this.refresh();}));
    this.summary=document.createElement("div"); this.summary.className="quantity-summary";
    this.error=document.createElement("p"); this.error.className="unavailable"; this.error.setAttribute("role","status");
    this.confirm=makeButton(`${transactionLabels[request.type]} 확인`,()=>{
      this.refresh(); if(this.confirm.disabled || !this.request)return;
      this.actionId=this.send(this.request,parseQuantity(this.input.value)!); this.refresh();
    }); this.confirm.className="primary quantity-confirm";
    const cancel=makeButton("취소",()=>this.close());
    const footer=document.createElement("footer"); footer.append(cancel,this.confirm);
    this.node.append(heading,item,this.limit,controls,quick,this.summary,this.error,footer);
    this.refresh(); this.node.showModal();
    // Avoid opening Android's keyboard until the number itself is tapped.
    cancel.focus({preventScroll:true});
  }
  private max():number { const r=this.request,c=r&&this.context(r);return r&&c?.member?transactionQuote(r,c.member,c.day,c.chest,c.capacity).max:0; }
  refresh():void {
    const r=this.request;if(!r)return;
    const c=this.context(r), q=c.member&&transactionQuote(r,c.member,c.day,c.chest,c.capacity);
    const n=parseQuantity(this.input.value), busy=!!this.actionId||c.busy;
    this.input.disabled=busy;
    for(const b of this.controls)b.disabled=busy;
    this.limit.textContent=`현재 보유 ${q?.owned ?? 0}개 · 이번 거래 최대 ${q?.max ?? 0}${r.type==="craftItem"?"회":"개"} · 1회 거래 한도 999 (초과분은 나누어 거래)`;
    let error=!c.ready?"연결·거리·최신 수량을 확인해 주세요.":!q?.max?"수량, 골드 또는 빈 공간이 부족해요.":!n?"1 이상의 정수만 입력해 주세요.":n>q.max?`현재 가능한 최대 수량은 ${q.max}입니다.`:!q.valid(n)?"재료를 소비한 뒤에도 가방 공간이 부족해요.":"";
    this.summary.replaceChildren();
    const line=(text:string)=>{const p=document.createElement("p");p.textContent=text;this.summary.append(p);};
    if(q?.recipe){
      line(`제작 횟수: ${n ?? "—"}회`);
      for(const i of q.recipe.ingredients)line(`${itemName(i.itemId)}: 필요 ${n?i.quantity*n:"—"}개 / 보유 ${c.member?.inventory[i.itemId]??0}개`);
      line(`결과: ${itemName(q.recipe.output.itemId)} ${n?q.recipe.output.quantity*n:"—"}개`);
    }else if(["buyItem","sellItem","shipItem","withdrawShipment"].includes(r.type)){
      line(`보유 골드: ${(c.member?.money??0).toLocaleString()} G · 개당 ${q?.price??0} G`);
      line(`${r.type==="buyItem"?"총 구매 가격":r.type==="withdrawShipment"?"취소할 정산 금액":"예상 판매 금액"}: ${n?((q?.price??0)*n).toLocaleString():"—"} G`);
      if(r.type==="shipItem")line("다음 날 아침에 지급 · 잠자기 전 본인만 회수 가능");
      if(r.type==="sellItem")line("상점 즉시 판매 · 확인 후 골드 지급");
    }else line(`이동 수량: ${n??"—"}개 · 확인 전에는 이동하지 않아요.`);
    this.error.textContent=busy?"서버 저장 결과를 확인하고 있어요…":error;
    this.confirm.disabled=busy||!!error;
  }
  result(result:ActionResult):void {
    if(!this.actionId || result.actionId!==this.actionId)return;
    this.actionId=undefined;
    if(result.ok)this.close();
    else {this.refresh();this.error.textContent=result.message;}
  }
  disconnected():void {
    // Never retry a potentially committed transfer under a fresh action ID.
    if(this.actionId)this.close();else this.refresh();
  }
}
