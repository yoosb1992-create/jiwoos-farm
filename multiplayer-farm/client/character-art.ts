import type Phaser from "phaser";
import { appearanceColor, appearanceKey, DEFAULT_APPEARANCE, type Appearance } from "../shared/appearance.js";
import type { Facing } from "../shared/world.js";
import { CHARACTER_MASKS } from "./character-masks.js";
import { drawShoe, headLayers, shade } from "./character-parts.js";
import { FARMER_FRAMES } from "./tool-animation-art.js";
export const CHARACTER_SOURCE="/assets/graphics-vertical-slice/player/adult-farmer-48.png";
export const CHARACTER_DIRECTIONS:Facing[]=["down","up","left","right"];
export const characterScale=(a:Appearance=DEFAULT_APPEARANCE)=>({x:1.05*(1+(a.height/100-1)*.3),y:1.05*a.height/100});
const decoded=new Map<string,Uint8Array>();
function decode(rle:string):Uint8Array {
  let data=decoded.get(rle);if(data)return data;
  data=new Uint8Array(48*72);let offset=0;
  for(const match of rle.matchAll(/([0-9a-z]+)([A-Z])/g)){
    const length=parseInt(match[1]!,36);data.fill(match[2]!.charCodeAt(0)-65,offset,offset+length);offset+=length;
  }
  decoded.set(rle,data);return data;
}
const paletteCache=new Map<string,string[]>();
function palette(a:Appearance):string[] {
  const colors=[appearanceColor(a,"skinColor"),appearanceColor(a,"top"),appearanceColor(a,"bottom"),(a.top==="original"||a.top==="terracotta")&&!a.customColors?.top?"#e7d8ab":shade(appearanceColor(a,"top"),1.25),"#587047"];
  const key=colors.join();let palette=paletteCache.get(key);if(palette)return palette;
  palette=["transparent"];
  for(const color of colors)for(const light of [.46,.74,1,1.2])palette.push(shade(color,light));
  // A neutral warm outline is separate from every dye channel.
  while(palette.length<=25)palette.push("#352d2b");
  paletteCache.set(key,palette);if(paletteCache.size>48)paletteCache.delete(paletteCache.keys().next().value!);return palette;
}
/** Separate shoulder/waist/hip ratios, with continuous transitions into the
 * limbs. Every pixel in a row (including skin and outline) shares the transform
 * so slimming the waist cannot leave detached hand/outline pixels behind. */
function bodyFactor(frame:number,a:Appearance,y:number):number {
  const dy=y-CHARACTER_MASKS[frame]!.neck;
  if(dy<0||dy>=20)return 1;
  const stops=a.gender==="male"?[[0,1],[3,1.14],[6,1.14],[11,1.05],[15,1.02],[20,1]]:[[0,1],[3,.87],[6,.87],[11,.76],[15,1.04],[20,1]];
  for(let i=1;i<stops.length;i++){
    const [from,left]=stops[i-1]!,[to,right]=stops[i]!;
    if(dy<=to!)return left!+(right!-left!)*(dy-from!)/(to!-from!);
  }
  return 1;
}
function bodyX(frame:number,a:Appearance,x:number,y:number):number {
  const cx=CHARACTER_MASKS[frame]!.head[0];return cx+Math.floor((x-cx)*bodyFactor(frame,a,y));
}
export function characterHand(a:Appearance,facing:Facing,pose:keyof typeof FARMER_FRAMES.down):readonly[number,number] {
  const frame=actionIndex(facing,pose),[x,y]=FARMER_FRAMES[facing][pose].hand;
  return [bodyX(frame,a,x,y),y];
}
const bodyLayers=new Map<string,HTMLCanvasElement>();
function bodyLayer(c:CanvasRenderingContext2D,frame:number,a:Appearance,foreground=false):void {
  const key=[frame,foreground,a.gender,...palette(a)].join("|");
  const hit=bodyLayers.get(key);
  if(hit){bodyLayers.delete(key);bodyLayers.set(key,hit);c.drawImage(hit,0,0);return;}
  const tile=document.createElement("canvas");tile.width=48;tile.height=72;const dest=tile.getContext("2d")!;
  const mask=CHARACTER_MASKS[frame]!,data=decode(foreground?mask.front:mask.body),colors=palette(a);
  for(let y=0;y<72;y++){
    const factor=bodyFactor(frame,a,y),cx=mask.head[0];
    for(let x=0;x<48;x++){
      const code=data[y*48+x]!;if(!code)continue;
      const xx=cx+Math.floor((x-cx)*factor),end=cx+Math.floor((x+1-cx)*factor);
      if(end>xx){dest.fillStyle=colors[code]!;dest.fillRect(xx,y,end-xx,1);}
    }
  }
  bodyLayers.set(key,tile);while(bodyLayers.size>240)bodyLayers.delete(bodyLayers.keys().next().value!);
  c.drawImage(tile,0,0);
}
/** The atlas supplies the 48 authored poses as fixed masks. Head/face/shoe
 * layers are reused by direction. No RGB thresholding or image reads occur
 * here, and there is no default-outfit bypass that flashes the source art. */
export function paintCharacterFrame(c:CanvasRenderingContext2D,_source:CanvasImageSource,
  sx:number,sy:number,a:Appearance,facing:Facing):void {
  const frame=Math.floor(sy/72)*16+Math.floor(sx/48),mask=CHARACTER_MASKS[frame]!;
  c.clearRect(0,0,48,72);c.imageSmoothingEnabled=false;
  const head=headLayers(a,facing),[hx,hy]=mask.head;
  c.drawImage(head.back,hx-24,hy-8);
  bodyLayer(c,frame,a);
  for(const [x,y,w] of mask.feet)drawShoe(c,a,x,y,w,facing);
  c.drawImage(head.front,hx-24,hy-8);
  bodyLayer(c,frame,a,true);
}

type Bank={keys:Set<string>;used:number};
type Cache={id:number;banks:Map<string,Bank>;swept:number};
let sceneId=0;
const banks=new WeakMap<Phaser.Scene,Cache>();
const signatures=new WeakMap<Appearance,string>();
function signature(a:Appearance):string {let s=signatures.get(a);if(!s){s=appearanceKey(a);signatures.set(a,s);}return s;}
function sceneCache(scene:Phaser.Scene):Cache {
  let cache=banks.get(scene);if(cache)return cache;
  cache={id:++sceneId,banks:new Map(),swept:0};banks.set(scene,cache);
  const owned=cache;
  scene.events.once("shutdown",()=>{for(const b of owned.banks.values())for(const key of b.keys)scene.textures.remove(key);owned.banks.clear();banks.delete(scene);});
  return cache;
}
/** Retain every referenced texture (including hidden peers/carry/tool images).
 * Periodic sweeping also runs on cache hits, so inactive appearances really
 * expire even when the player has stopped changing their outfit. */
export function pruneAppearanceTextures(scene:Phaser.Scene,now=performance.now()):void {
  const cache=banks.get(scene);if(!cache||now-cache.swept<5000)return;cache.swept=now;
  const referenced=new Set<string>();
  for(const child of scene.children.list){const image=child as Phaser.GameObjects.Image;if(image.texture?.key)referenced.add(image.texture.key);}
  for(const [id,b] of cache.banks)if(now-b.used>30000&&![...b.keys].some(k=>referenced.has(k))){
    for(const key of b.keys)scene.textures.remove(key);cache.banks.delete(id);
  }
}
function actionIndex(facing:Facing,pose:keyof typeof FARMER_FRAMES.down):number {
  const f=FARMER_FRAMES[facing][pose];return f.row*16+f.column;
}
/** Shared by gameplay, tools, carrying and the editor. Height never enters the
 * signature. Only appearances that are actually seen receive a texture bank. */
export function appearanceTexture(scene:Phaser.Scene,base:string,a:Appearance=DEFAULT_APPEARANCE):string {
  const cache=sceneCache(scene),id=signature(a),key=`outfit-${cache.id}-${id}-${base}`;
  let bank=cache.banks.get(id);if(!bank){bank={keys:new Set(),used:0};cache.banks.set(id,bank);}bank.used=performance.now();
  pruneAppearanceTextures(scene,bank.used);
  if(scene.textures.exists(key))return key;
  const source=scene.textures.get("player").getSourceImage() as HTMLImageElement;
  const canvas=document.createElement("canvas");canvas.width=base==="player"?768:48;canvas.height=base==="player"?216:72;
  const dest=canvas.getContext("2d")!;dest.imageSmoothingEnabled=false;
  const tile=document.createElement("canvas");tile.width=48;tile.height=72;const c=tile.getContext("2d")!;
  const paint=(index:number,facing:Facing)=>paintCharacterFrame(c,source,index%16*48,Math.floor(index/16)*72,a,facing);
  if(base==="player"){
    for(let row=0;row<3;row++)for(let col=0;col<16;col++){
      paint(row*16+col,CHARACTER_DIRECTIONS[Math.floor(col/4)]!);dest.drawImage(tile,col*48,row*72);
    }
    const texture=scene.textures.addCanvas(key,canvas)!;
    for(let row=0;row<3;row++)for(let col=0;col<16;col++)texture.add(row*16+col,0,col*48,row*72,48,72);
  }else{
    const facing=CHARACTER_DIRECTIONS.find(d=>base.includes(`-${d}-`))??"down";
    if(base.startsWith("farmer-carry-")){
      paint(actionIndex(facing,"raised"),facing);dest.drawImage(tile,0,0,48,52,0,0,48,52);
      paint(16+CHARACTER_DIRECTIONS.indexOf(facing)*4+Number(base.split("-").at(-1)),facing);
      dest.drawImage(tile,0,52,48,20,0,52,48,20);
    }else{
      const pose=base.split("-")[3] as keyof typeof FARMER_FRAMES.down;
      paint(actionIndex(facing,pose),facing);
      if(base.endsWith("-palm")){
        const [x,y]=characterHand(a,facing,pose);dest.drawImage(tile,x-2,y-2,4,4,x-2,y-2,4,4);
      }else dest.drawImage(tile,0,0);
    }
    scene.textures.addCanvas(key,canvas);
  }
  scene.textures.get(key).setFilter(0);bank.keys.add(key);return key;
}
