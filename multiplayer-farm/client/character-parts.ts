import { appearanceColor, type Appearance } from "../shared/appearance.js";
import type { Facing } from "../shared/world.js";
export type Polygon=readonly number[];
export const shade=(hex:string,factor:number)=>"#"+[1,3,5].map(i=>Math.min(255,Math.max(0,Math.round(parseInt(hex.slice(i,i+2),16)*factor))).toString(16).padStart(2,"0")).join("");
const mix=(a:string,b:string,t:number)=>"#"+[1,3,5].map(i=>Math.round(parseInt(a.slice(i,i+2),16)*(1-t)+parseInt(b.slice(i,i+2),16)*t).toString(16).padStart(2,"0")).join("");
/** Integer scan conversion: no antialiased edges, random noise or frame-time
 * classification. The same part pixels follow authored anchors in every pose. */
export function pixelPolygon(c:CanvasRenderingContext2D,p:Polygon,color:string):void {
  c.fillStyle=color;
  const ys=p.filter((_,i)=>i%2===1),min=Math.floor(Math.min(...ys)),max=Math.ceil(Math.max(...ys));
  for(let y=min;y<max;y++){
    const hits:number[]=[];
    for(let i=0;i<p.length;i+=2){const j=(i+2)%p.length,x1=p[i]!,y1=p[i+1]!,x2=p[j]!,y2=p[j+1]!;
      if((y1<=y+.5&&y2>y+.5)||(y2<=y+.5&&y1>y+.5))hits.push(x1+(y+.5-y1)*(x2-x1)/(y2-y1));
    }
    hits.sort((a,b)=>a-b);
    for(let i=0;i+1<hits.length;i+=2){const x=Math.ceil(hits[i]!-.5),end=Math.ceil(hits[i+1]!-.5);c.fillRect(x,y,end-x,1);}
  }
}
const rect=(c:CanvasRenderingContext2D,x:number,y:number,w:number,h:number,color:string)=>{c.fillStyle=color;c.fillRect(x,y,w,h);};
function textured(c:CanvasRenderingContext2D,p:Polygon,color:string,hair=false):void {
  const tile=document.createElement("canvas");tile.width=48;tile.height=56;
  const t=tile.getContext("2d")!;t.translate(24,8);pixelPolygon(t,p,"#ffffff");t.setTransform(1,0,0,1,0,0);
  const d=t.getImageData(0,0,48,56).data;
  const colors=[shade(color,.43),shade(color,.73),color,mix(color,"#ffe1ac",.23)];
  for(let y=0;y<56;y++)for(let x=0;x<48;x++)if(d[(y*48+x)*4+3]){
    const on=(xx:number,yy:number)=>xx>=0&&xx<48&&yy>=0&&yy<56&&d[(yy*48+xx)*4+3];
    const edge=!on(x-1,y)||!on(x+1,y)||!on(x,y-1)||!on(x,y+1);
    const streak=hair&&((x+Math.floor(y/4))%5===0);
    const light=hair&&((x+Math.floor(y/6))%6===2)&&y<25;
    rect(c,x-24,y-8,1,1,colors[edge?0:light?3:streak?1:2]!);
  }
}
export interface EarPartDefinition {
  /** Coordinates relative to the attachment. Add types here without changing the compositor. */
  front:Polygon; side:Polygon; back:Polygon;
  anchor:Record<"front"|"side"|"back",readonly[number,number]>;
  tint:"skinColor"|"fixed"; color?:string;
}
const ear=(front:Polygon,side:Polygon=front):EarPartDefinition=>({front,side,back:front,anchor:{front:[7,14],side:[-3,14],back:[7,14]},tint:"skinColor"});
export const EAR_PARTS:Record<Appearance["earStyle"],EarPartDefinition>={
  normal:ear([0,0,3,-1,4,1,4,4,2,6,0,4]),
  small:ear([0,1,2,0,3,2,2,4,0,4]),
  large:ear([0,0,4,-2,6,0,6,5,3,7,0,5]),
  pointed:ear([0,1,7,-3,5,3,2,6,0,4]),
  long:ear([0,1,12,-5,9,1,5,4,2,6,0,4]),
};
export const EYE_PARTS:Record<Appearance["eyeShape"],{outline:Polygon;iris:readonly[number,number,number,number]}>={
  original:{outline:[0,1,1,0,4,0,4,4,1,4,0,3],iris:[1,1,2,2]},
  round:{outline:[1,0,3,0,4,1,4,4,3,5,1,5,0,4,0,1],iris:[1,1,2,3]},
  large:{outline:[0,1,1,0,4,0,5,1,5,5,1,5,0,4],iris:[2,1,2,3]},
  narrow:{outline:[0,1,5,1,5,3,0,3],iris:[2,1,2,1]},
  gentle:{outline:[0,2,1,1,3,0,5,1,5,4,2,4,0,3],iris:[2,1,2,2]},
  sharp:{outline:[0,0,2,1,5,2,4,4,1,4,0,3],iris:[1,2,2,1]},
};
export const EYEBROW_PARTS:Record<Appearance["eyebrowStyle"],Polygon>={
  original:[0,1,1,0,4,0,4,1,1,1,0,2],straight:[0,1,5,1,5,2,0,2],
  round:[0,1,1,0,4,0,5,1,5,2,4,1,1,1,0,2],
  raised:[0,0,2,0,5,2,5,3,2,1,0,1],gentle:[0,2,3,0,5,0,5,1,3,1,0,3],
};
export const NOSE_PARTS:Record<Appearance["noseStyle"],{front:Polygon;side:Polygon}>={
  original:{front:[0,0,1,0,1,2,-1,2,-1,1],side:[0,0,2,1,2,2,0,2]},
  small:{front:[0,1,1,1,1,2,0,2],side:[0,1,1,1,1,2,0,2]},
  round:{front:[-1,0,1,0,2,1,2,2,0,3,-1,2],side:[0,0,2,0,3,1,3,3,0,3]},
  pointed:{front:[0,0,2,2,-1,2],side:[0,0,4,2,0,3]},
  long:{front:[0,-1,1,-1,1,3,-1,3,-1,2,0,2],side:[0,-1,2,0,3,3,0,4]},
};
const HAIR_CAPS:Record<Appearance["hair"],Polygon>={
  original:[-10,15,-12,9,-9,5,-8,3,-5,3,-4,0,-1,1,1,-1,4,2,8,3,11,8,10,15,7,13,7,10,5,12,3,9,1,12,-1,10,-4,12,-5,10,-7,14],
  short:[-9,12,-9,5,-6,2,5,2,9,5,9,12,7,11,6,8,3,9,2,7,-1,9,-4,8,-6,11],
  parted:[-10,14,-11,8,-8,3,-2,0,3,1,8,3,10,7,10,15,7,13,6,8,2,5,1,9,-3,11,-6,12,-8,16],
  bob:[-11,22,-12,9,-10,4,-6,1,5,1,10,4,12,10,11,22,7,22,7,10,3,11,-4,11,-7,10,-7,22],
  long:[-11,24,-11,8,-8,3,-3,0,4,1,9,4,11,9,10,25,7,23,7,10,3,8,0,6,-3,9,-7,10,-7,23],
  wave:[-12,24,-14,20,-12,15,-13,10,-10,5,-6,1,1,0,7,2,11,6,12,11,11,15,14,20,12,25,8,24,7,18,8,11,4,8,0,7,-4,10,-7,11,-7,17,-8,23],
  ponytail:[-10,14,-11,7,-7,2,0,0,6,1,10,5,11,11,8,15,7,9,4,9,1,7,-2,10,-6,10,-7,15],
  bun:[-9,14,-10,7,-7,2,-1,1,5,2,9,6,10,12,7,14,6,9,3,8,0,6,-3,9,-6,10,-7,14],
};
function hairBack(c:CanvasRenderingContext2D,a:Appearance,facing:Facing):void {
  const color=appearanceColor(a,"hairColor"),style=a.hair,side=facing==="left"||facing==="right";
  if(style==="long"||style==="wave"){
    const p=style==="long"?[-10,7,10,7,12,32,8,35,3,34,-3,35,-10,34,-12,31]:[-11,6,10,6,12,12,11,17,14,23,12,28,14,32,8,35,3,33,-2,35,-8,34,-13,31,-12,27,-14,22,-12,17];
    textured(c,p,color,true);
  }
  if(style==="bob")textured(c,[-10,6,10,6,12,20,9,24,-9,24,-12,20],color,true);
  if(style==="ponytail"){
    c.save();c.translate(side?-10:facing==="up"?0:8,7);
    textured(c,[-3,0,3,0,5,7,3,12,4,18,1,27,-3,25,-5,20,-4,13,-5,7],color,true);
    rect(c,-3,3,7,2,"#cb827a");c.restore();
  }
  if(style==="bun"){
    c.save();c.translate(side?-8:0,-2);textured(c,[-5,1,-4,-3,-1,-5,3,-4,6,-1,6,4,3,7,-3,6],color,true);
    rect(c,-3,4,7,1,"#d9b980");c.restore();
  }
}
function ears(c:CanvasRenderingContext2D,a:Appearance,facing:Facing):void {
  const def=EAR_PARTS[a.earStyle],view=facing==="up"?"back":facing==="down"?"front":"side";
  const color=def.tint==="skinColor"?appearanceColor(a,"skinColor"):def.color??"#aab2ab";
  const [x,y]=def.anchor[view];
  for(const mirror of view==="side"?[1]:[-1,1]){
    c.save();c.scale(mirror,1);c.translate(x,y);if(view==="side")c.scale(-1,1);textured(c,def[view],color);
    rect(c,1,2,1,2,shade(color,.69));c.restore();
  }
}
function face(c:CanvasRenderingContext2D,a:Appearance,facing:Facing):void {
  const skin=appearanceColor(a,"skinColor"),female=a.gender==="female",side=facing!=="down";
  const shape:Polygon=side?[-6,7,6,6,9,10,9,18,5,22,-1,22,-6,18]:female?[-6,7,6,7,8,11,8,17,5,20,2,22,-2,22,-5,20,-8,17,-8,11]:[-6,7,6,7,9,11,9,17,6,21,4,22,-4,22,-7,20,-9,17,-9,11];
  textured(c,shape,skin);
  pixelPolygon(c,side?[-4,9,6,8,7,11,6,18,3,20,-3,18]:[-5,9,5,9,7,12,6,18,3,20,-4,19,-6,17,-6,11],mix(skin,"#ffe9c3",.08));
  if(facing==="up")return;
  const eye=EYE_PARTS[a.eyeShape],brow=EYEBROW_PARTS[a.eyebrowStyle];
  for(const mirror of side?[1]:[-1,1]){
    c.save();if(!side)c.scale(mirror,1);c.translate(side?3:2,14);
    pixelPolygon(c,eye.outline,"#eee4ce");
    // Open lower lids avoid a square spectacle outline on the tiny face.
    const lid=document.createElement("canvas");lid.width=6;lid.height=6;const lc=lid.getContext("2d")!;
    pixelPolygon(lc,eye.outline,"#ffffff");const lp=lc.getImageData(0,0,6,6).data;
    for(let px=0;px<6;px++)for(let py=0;py<6;py++)if(lp[(py*6+px)*4+3]){rect(c,px,py,1,1,shade(skin,.28));break;}
    const [x,y,w,h]=eye.iris;rect(c,x,y,w,h,appearanceColor(a,"eyeColor"));
    if(h>1)rect(c,x,y,1,1,"#fff4df");
    c.translate(0,-3);pixelPolygon(c,brow,shade(appearanceColor(a,"eyebrowColor"),.67));c.restore();
  }
  c.save();c.translate(side?8:0,17);pixelPolygon(c,NOSE_PARTS[a.noseStyle][side?"side":"front"],shade(skin,.68));
  if(side)rect(c,0,0,1,1,mix(skin,"#fff0cf",.2));c.restore();
  rect(c,side?4:-1,20,2,1,shade(skin,.56));
}
function hairFront(c:CanvasRenderingContext2D,a:Appearance,facing:Facing):void {
  const color=appearanceColor(a,"hairColor");
  if(facing==="up"){
    const back=a.hair==="short"?[-8,4,-5,2,5,2,9,6,9,14,6,19,-5,19,-9,14]:[-10,6,-7,2,-2,0,5,1,10,5,12,10,10,17,5,21,-4,21,-10,17,-12,11];
    textured(c,back,color,true);
    if(a.hair==="long"||a.hair==="wave"||a.hair==="bob"){
      const length=a.hair==="bob"?23:a.hair==="long"?34:32;
      textured(c,[-8,12,9,12,10,length-2,6,length,-6,length+1,-10,length-2],color,true);
    }
    if(a.hair==="ponytail") {textured(c,[-3,10,3,10,5,19,3,29,0,34,-4,30,-5,21],color,true);rect(c,-3,12,6,2,"#cb827a");}
    if(a.hair==="bun"){textured(c,[-5,6,-4,2,2,0,6,4,6,9,2,13,-3,12],color,true);rect(c,-4,9,9,1,"#d9b980");}
    if(a.hair==="parted"){rect(c,0,3,1,10,shade(color,.62));rect(c,-1,3,1,8,shade(color,1.22));}
    return;
  }
  textured(c,HAIR_CAPS[a.hair],color,true);
  if(facing!=="down"){
    // A rear lock shapes the side profile; leave the visible eye/nose clear.
    textured(c,a.hair==="short"?[-9,7,-4,8,-4,12,-6,15,-9,14]:[-9,8,-3,8,-3,17,-5,20,-9,17,-11,12],color,true);
  }
  if(a.hair==="parted"){rect(c,1,3,1,4,shade(color,.46));rect(c,2,4,1,3,shade(color,1.2));}
}
export interface HeadLayers { back:HTMLCanvasElement; front:HTMLCanvasElement }
const heads=new Map<string,HeadLayers>();
export function headLayers(a:Appearance,facing:Facing):HeadLayers {
  const key=[a.gender,a.hair,a.eyeShape,a.eyebrowStyle,a.noseStyle,a.earStyle,facing,...(["hairColor","skinColor","eyeColor","eyebrowColor"] as const).map(k=>appearanceColor(a,k))].join("|");
  const hit=heads.get(key);if(hit){heads.delete(key);heads.set(key,hit);return hit;}
  const make=()=>{const c=document.createElement("canvas");c.width=48;c.height=56;return c;};
  const layers={back:make(),front:make()};
  for(const [name,canvas] of Object.entries(layers)){
    const c=canvas.getContext("2d")!;c.translate(24,8);if(facing==="left")c.scale(-1,1);
    if(name==="back")hairBack(c,a,facing);
    else {ears(c,a,facing);if(facing!=="up")face(c,a,facing);hairFront(c,a,facing);}
  }
  heads.set(key,layers);while(heads.size>64)heads.delete(heads.keys().next().value!);return layers;
}
export function drawShoe(c:CanvasRenderingContext2D,a:Appearance,x:number,bottom:number,width:number,facing:Facing):void {
  const color=appearanceColor(a,"shoeColor"),skin=appearanceColor(a,"skinColor"),style=a.shoeStyle;
  const h=style==="wellies"?9:style==="boots"?6:style==="sneakers"?4:3;
  const side=facing==="left"||facing==="right";const toe=style==="sneakers"?1:0;
  c.save();c.translate(x,bottom+1);
  if(style==="sandals"){
    rect(c,1,-5,Math.max(2,width-2),4,skin);rect(c,0,-3,width,2,skin);
    rect(c,0,-1,width,1,shade(color,.44));rect(c,1,-4,1,3,color);rect(c,width-2,-3,1,3,color);rect(c,0,-2,width,1,color);
  }else{
    const left=side&&facing==="left"?-toe:0,right=width+(side&&facing==="right"?toe:0);
    pixelPolygon(c,[1,-h,width-1,-h,width-1,-3,right,-2,right,0,left,0,left,-3,1,-3],shade(color,.45));
    rect(c,1,-h+1,Math.max(1,width-2),h-2,color);
    rect(c,left+1,-2,Math.max(1,right-left-2),1,shade(color,1.18));
    if(style==="sneakers")rect(c,left,-1,right-left,1,"#dfdfc8");
    else rect(c,1,-h+1,width-2,1,shade(color,style==="wellies"?1.3:.7));
  }
  c.restore();
}
