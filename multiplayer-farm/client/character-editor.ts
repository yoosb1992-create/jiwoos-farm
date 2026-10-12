import { APPEARANCE_OPTIONS, appearanceOf, type Appearance } from "../shared/appearance.js";
import { CHARACTER_SOURCE, characterScale, paintCharacterFrame } from "./character-art.js";
import type { Facing } from "../shared/world.js";
const labels:Record<keyof typeof APPEARANCE_OPTIONS,string>={gender:"성별",height:"키",hair:"헤어스타일",hairColor:"헤어 색상",top:"상의",bottom:"하의",shoes:"신발"};
const element=<K extends keyof HTMLElementTagNameMap>(tag:K,text="",cls="")=>{const n=document.createElement(tag);n.textContent=text;n.className=cls;return n;};
export class CharacterEditor {
  private source=new Image();
  private raf=0;
  private root?:HTMLElement;
  private status?:HTMLElement;
  private draft=appearanceOf();
  private cache=new Map<string,HTMLCanvasElement>();
  constructor(){this.source.src=CHARACTER_SOURCE;}
  get value():Appearance{return {...this.draft};}
  dispose():void{cancelAnimationFrame(this.raf);this.root=undefined;this.cache.clear();}
  busy(message:string,pending=false):void {
    if(this.status)this.status.textContent=message;
    this.root?.querySelectorAll<HTMLButtonElement|HTMLSelectElement>("button,select").forEach(e=>e.disabled=pending);
  }
  mount(body:HTMLElement,value:Appearance,save:(a:Appearance)=>void,cancel:()=>void):void {
    this.dispose();this.draft={...value};
    const root=element("div","","character-layout");this.root=root;
    const preview=element("section","","character-preview");preview.ariaLabel="캐릭터 미리보기";
    preview.append(element("span","MY FARMER","eyebrow"),element("h3","나의 농부"));
    const canvas=element("canvas");canvas.id="character-preview";canvas.width=240;canvas.height=250;
    canvas.ariaLabel="선택한 외형과 방향의 캐릭터";preview.append(canvas);
    const facingBar=element("div","","character-directions");
    let facing:Facing="down",motion="walk";
    for(const [dir,label] of [["left","왼쪽"],["up","뒷모습"],["down","앞모습"],["right","오른쪽"]] as const){
      const b=element("button",label);b.type="button";b.setAttribute("aria-pressed",String(dir===facing));
      b.onclick=()=>{facing=dir;facingBar.querySelectorAll("button").forEach(n=>n.setAttribute("aria-pressed",String(n===b)));};facingBar.append(b);
    }
    preview.append(facingBar);
    const movement=element("select");movement.ariaLabel="미리보기 동작";
    for(const [id,label] of [["idle","대기"],["walk","걷기"],["run","달리기"]]){const o=element("option",label);o.value=id!;movement.append(o);}
    movement.value=motion;movement.onchange=()=>{motion=movement.value;};preview.append(movement);
    preview.append(element("small","키와 외형은 능력치에 영향을 주지 않아요."));
    const form=element("section","","character-options");form.ariaLabel="캐릭터 외형 선택";
    for(const [key,options] of Object.entries(APPEARANCE_OPTIONS)) {
      const field=key as keyof typeof APPEARANCE_OPTIONS;
      const label=element("label",labels[field]),select=element("select");select.dataset.appearance=key;select.ariaLabel=labels[field];
      for(const [id,name] of Object.entries(options)){const option=element("option",name);option.value=id;select.append(option);}
      select.value=this.draft[field];select.onchange=()=>{this.draft={...this.draft,[field]:select.value};this.cache.clear();};
      label.append(select);form.append(label);
    }
    const reset=element("button","기본 외형 복원");reset.type="button";
    reset.onclick=()=>{
      this.draft=appearanceOf();this.cache.clear();
      for(const s of form.querySelectorAll<HTMLSelectElement>("select[data-appearance]"))s.value=this.draft[s.dataset.appearance as keyof typeof APPEARANCE_OPTIONS];
    };form.append(reset);
    const actions=element("div","","character-save");
    const saveButton=element("button","외형 저장"),cancelButton=element("button","취소");
    saveButton.id="appearance-save";saveButton.onclick=()=>save(this.value);cancelButton.onclick=cancel;
    actions.append(saveButton,cancelButton);
    this.status=element("p","저장을 눌러야 캐릭터에 적용돼요.","character-status");this.status.role="status";
    root.append(preview,form,actions,this.status);body.append(root);
    const c=canvas.getContext("2d")!;
    const draw=(now:number)=>{
      if(this.root!==root)return;
      if(this.source.complete&&this.source.naturalWidth){
        const phase=Math.floor(now/(motion==="idle"?500:motion==="run"?70:100))%4;
        const key=`${facing}-${motion}-${phase}`;
        let frame=this.cache.get(key);
        if(!frame){frame=document.createElement("canvas");frame.width=48;frame.height=72;
          const dir=["down","up","left","right"].indexOf(facing);
          paintCharacterFrame(frame.getContext("2d")!,this.source,(dir*4+phase)*48,motion==="idle"?0:72,this.draft,facing);this.cache.set(key,frame);
        }
        c.clearRect(0,0,240,250);c.fillStyle="#dfe8cd";c.beginPath();c.ellipse(120,215,58,13,0,0,Math.PI*2);c.fill();
        const scale=characterScale(this.draft),w=48*3*scale.x,h=72*3*scale.y;
        c.imageSmoothingEnabled=false;c.drawImage(frame,120-w/2,215-h*70/72,w,h);
      }
      this.raf=requestAnimationFrame(draw);
    };this.raf=requestAnimationFrame(draw);
  }
}
