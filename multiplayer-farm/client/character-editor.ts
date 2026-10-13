import { APPEARANCE_OPTIONS, appearanceOf, appearanceColor, HEIGHT_MIN, HEIGHT_MAX, HEIGHT_STEP, type Appearance, type AppearanceField, type ColorSlot } from "../shared/appearance.js";
import { CHARACTER_SOURCE, CHARACTER_DIRECTIONS, characterScale, characterHeadRect, paintCharacterFrame } from "./character-art.js";
import type { Facing } from "../shared/world.js";
const labels:Record<AppearanceField,string>={gender:"성별",hair:"헤어스타일",hairColor:"헤어 색상",skinColor:"피부색",eyeShape:"눈 모양",eyeColor:"눈동자 색상",eyebrowStyle:"눈썹 모양",noseStyle:"코 모양",earStyle:"귀 모양",top:"상의",bottom:"하의",shoeStyle:"신발 종류",shoeColor:"신발 색상"};
const element=<K extends keyof HTMLElementTagNameMap>(tag:K,text="",cls="")=>{const n=document.createElement(tag);n.textContent=text;n.className=cls;return n;};
/** Authored comparison post has its own fixed scale, independent of the farmer. */
export function paintHeightPost(c:CanvasRenderingContext2D):void {
  c.fillStyle="#976e42";c.fillRect(193,22,17,237);c.fillStyle="#c79d65";c.fillRect(195,23,11,236);
  c.fillStyle="#815b3a";c.fillRect(191,255,23,3);c.fillRect(198,31,1,222);
  c.font="10px sans-serif";c.textAlign="right";
  // The default farmer has 49 visible pixels, at 3x preview magnification.
  for(let h=70;h<=145;h+=5){const y=Math.round(258-49*3*1.05*h/100);c.fillStyle=h===100?"#49644c":"#79552e";
    c.fillRect(h===100?184:195,y,h===100?26:h%10===0?14:8,h===100?2:1);
    if(h===100){c.fillText("100%",182,y+3);}else if(h===70||h===145)c.fillText(`${h}%`,190,y+3);
  }
}
export class CharacterEditor {
  private source=new Image();
  private raf=0;
  private root?:HTMLElement;
  private status?:HTMLElement;
  private draft=appearanceOf();
  private cache=new Map<string,HTMLCanvasElement>();
  constructor(){this.source.src=CHARACTER_SOURCE;}
  get value():Appearance{return appearanceOf(this.draft);}
  dispose():void{cancelAnimationFrame(this.raf);this.root=undefined;this.status=undefined;this.cache.clear();}
  busy(message:string,pending=false):void {
    if(this.status)this.status.textContent=message;
    this.root?.querySelectorAll<HTMLButtonElement|HTMLSelectElement|HTMLInputElement>("button,select,input").forEach(e=>e.disabled=pending);
  }
  mount(body:HTMLElement,value:Appearance,save:(a:Appearance)=>void,cancel:()=>void):void {
    this.dispose();this.draft=appearanceOf(value);
    const root=element("div","","character-layout");this.root=root;
    const preview=element("section","","character-preview");preview.ariaLabel="캐릭터 미리보기";
    preview.append(element("span","MY FARMER","eyebrow"),element("h3","나의 농부"));
    const canvas=element("canvas");canvas.id="character-preview";canvas.width=240;canvas.height=280;
    canvas.ariaLabel="고정된 키재기 기둥과 선택한 캐릭터";preview.append(canvas);
    const facingBar=element("div","","character-directions");
    let facing:Facing="down",motion="idle",started=performance.now(),lastDraw="";
    for(const [dir,label] of [["left","왼쪽"],["up","뒷모습"],["down","앞모습"],["right","오른쪽"]] as const){
      const b=element("button",label);b.type="button";b.setAttribute("aria-pressed",String(dir===facing));
      b.onclick=()=>{facing=dir;facingBar.querySelectorAll("button").forEach(n=>n.setAttribute("aria-pressed",String(n===b)));};facingBar.append(b);
    }
    preview.append(facingBar);
    const movement=element("select");movement.ariaLabel="미리보기 동작";
    for(const [id,label] of [["idle","대기"],["walk","걷기"],["run","달리기"]]){const o=element("option",label);o.value=id!;movement.append(o);}
    movement.value=motion;movement.onchange=()=>{motion=movement.value;started=performance.now();};preview.append(movement);
    const detail=element("details","","character-face-detail");detail.open=window.innerWidth>580;
    detail.append(element("summary","얼굴 확대 보기"));
    const face=element("canvas");face.id="character-face-preview";face.width=240;face.height=184;face.ariaLabel="실제 캐릭터의 얼굴 확대";detail.append(face);
    detail.ontoggle=()=>{lastDraw="";};preview.append(detail);
    preview.append(element("small","키와 외형은 능력치에 영향을 주지 않아요."));
    const form=element("section","","character-options");form.ariaLabel="캐릭터 외형 선택";
    const heightLabel=element("label","키","character-height"),range=element("input"),heightValue=element("output");
    range.type="range";range.min=String(HEIGHT_MIN);range.max=String(HEIGHT_MAX);range.step=String(HEIGHT_STEP);range.value=String(this.draft.height);range.ariaLabel="키";range.id="character-height";
    heightValue.htmlFor="character-height";
    const showHeight=()=>{heightValue.value=`${this.draft.height}%`;range.setAttribute("aria-valuetext",heightValue.value);};showHeight();
    range.oninput=()=>{this.draft={...this.draft,height:Number(range.value)};showHeight();lastDraw="";};
    const limits=element("small","작게 70% · 기본 100% · 크게 145%");heightLabel.append(heightValue,range,limits);preview.insertBefore(heightLabel,facingBar);
    const swatches=new Map<ColorSlot,HTMLElement>();
    const refreshSwatches=()=>{for(const [key,swatch] of swatches)swatch.style.backgroundColor=appearanceColor(this.draft,key);};
    for(const [key,options] of Object.entries(APPEARANCE_OPTIONS)) {
      const field=key as AppearanceField,label=element("label",labels[field]),select=element("select");select.dataset.appearance=key;select.ariaLabel=labels[field];
      for(const [id,name] of Object.entries(options)){const option=element("option",name);option.value=id;select.append(option);}
      select.value=this.draft[field];select.onchange=()=>{
        this.draft={...this.draft,[field]:select.value};
        // Picking a preset intentionally replaces that channel's custom color only.
        if(this.draft.customColors&&Object.hasOwn(this.draft.customColors,field)){
          this.draft.customColors={...this.draft.customColors};delete this.draft.customColors[field as ColorSlot];
        }
        this.cache.clear();refreshSwatches();lastDraw="";
      };
      if(["hairColor","skinColor","eyeColor","top","bottom","shoeColor"].includes(key)){
        const swatch=element("i","","character-swatch");swatch.ariaHidden="true";swatches.set(key as ColorSlot,swatch);label.append(swatch);
      }
      label.append(select);form.append(label);
    }
    refreshSwatches();
    const reset=element("button","기본 외형 복원");reset.type="button";
    reset.onclick=()=>{
      this.draft=appearanceOf();this.cache.clear();lastDraw="";
      for(const s of form.querySelectorAll<HTMLSelectElement>("select[data-appearance]"))s.value=this.draft[s.dataset.appearance as AppearanceField];
      range.value=String(this.draft.height);showHeight();refreshSwatches();
    };form.append(reset);
    const actions=element("div","","character-save"),saveButton=element("button","외형 저장"),cancelButton=element("button","취소");
    saveButton.id="appearance-save";saveButton.onclick=()=>save(this.value);cancelButton.onclick=cancel;
    actions.append(saveButton,cancelButton);
    this.status=element("p","저장을 눌러야 캐릭터에 적용돼요.","character-status");this.status.role="status";
    root.append(preview,form,actions,this.status);body.append(root);
    const c=canvas.getContext("2d")!,fc=face.getContext("2d")!;
    const draw=(now:number)=>{
      if(this.root!==root)return;
      if(this.source.complete&&this.source.naturalWidth&&!document.hidden){
        const phase=Math.floor(Math.max(0,now-started)/(motion==="idle"?500:motion==="run"?70:100))%4;
        const key=`${facing}-${motion}-${phase}`,drawKey=`${key}-${this.draft.height}-${detail.open}`;
        if(lastDraw!==drawKey){
          lastDraw=drawKey;
          let frame=this.cache.get(key);const dir=CHARACTER_DIRECTIONS.indexOf(facing),index=(motion==="idle"?0:16)+dir*4+phase;
          if(!frame){frame=document.createElement("canvas");frame.width=48;frame.height=72;
            paintCharacterFrame(frame.getContext("2d")!,this.source,index%16*48,Math.floor(index/16)*72,this.draft,facing);this.cache.set(key,frame);
          }
          c.clearRect(0,0,240,280);c.fillStyle="#dbe4ca";c.beginPath();c.ellipse(117,258,99,10,0,0,Math.PI*2);c.fill();paintHeightPost(c);
          const scale=characterScale(this.draft),w=48*3*scale.x,h=72*3*scale.y;
          c.imageSmoothingEnabled=false;c.drawImage(frame,101-w/2,258-h,w,h);
          if(detail.open){
            fc.clearRect(0,0,240,184);fc.fillStyle="#e7ebd7";fc.fillRect(0,0,240,184);
            const crop=characterHeadRect(index);fc.imageSmoothingEnabled=false;
            fc.drawImage(frame,crop.x,crop.y,crop.width,crop.height,5,2,230,180);
          }
        }
      }
      this.raf=requestAnimationFrame(draw);
    };this.raf=requestAnimationFrame(draw);
  }
}
