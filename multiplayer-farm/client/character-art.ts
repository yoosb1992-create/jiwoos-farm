import type Phaser from "phaser";
import { appearanceOf, appearanceKey, DEFAULT_APPEARANCE, HEIGHT_SCALE, type Appearance } from "../shared/appearance.js";
import type { Facing } from "../shared/world.js";

export const CHARACTER_SOURCE = "/assets/graphics-vertical-slice/player/adult-farmer-48.png";
const palettes = {
  hairColor: { original: "#845039", black: "#343342", chestnut: "#624132", gold: "#d9ac62", silver: "#bbc3cd", rose: "#b27388", sage: "#809578" },
  top: { original: "#94714a", cream: "#dfc99a", sage: "#8ca36b", blue: "#719fb7", rose: "#c58085", plum: "#9678a5", ochre: "#cdac56" },
  bottom: { original: "#745236", denim: "#547f99", charcoal: "#54545f", cream: "#ccbca0", forest: "#566f56" },
  shoes: { original: "#62402e", brown: "#906044", red: "#a5594e", blue: "#445b80", cream: "#cfc3ac" },
};
const rgb = (hex:string) => [1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
const original = (a:Appearance) => appearanceKey(a)===appearanceKey(DEFAULT_APPEARANCE);
export const characterScale = (value?:Appearance) => {
  const a=appearanceOf(value),h=HEIGHT_SCALE[a.height];
  return {x:1.05*(a.gender==="female"?.96:1)*(1+(h-1)*.3),y:1.05*h};
};

/** The same per-frame compositor is used by the game, tools, carrying and UI.
 * Source shading/face/limbs stay intact. Only bounded garment masks and hair
 * silhouettes change; no physics, atlas explosion or networked pixels. */
export function paintCharacterFrame(c:CanvasRenderingContext2D, source:CanvasImageSource,
  sx:number,sy:number,a:Appearance,facing:Facing):void {
  c.clearRect(0,0,48,72);c.imageSmoothingEnabled=false;
  c.drawImage(source,sx,sy,48,72,0,0,48,72);
  if(original(a))return;
  const data=c.getImageData(0,0,48,72),p=data.data;
  // Find the head in the middle columns, excluding raised hands at the sides.
  let top=24,found=false;
  for(let y=14;y<42&&!found;y++) {
    let count=0;
    for(let x=17;x<30;x++){const i=(y*48+x)*4;if(p[i+3]!>80&&p[i]!>p[i+1]!*1.1&&p[i+1]!<125)count++;}
    if(count>=5){top=y;found=true;}
  }
  let foot=70;
  outer:for(let y=71;y>54;y--)for(let x=12;x<35;x++)if(p[(y*48+x)*4+3]!>80){foot=y;break outer;}
  const center=facing==="left"?24:facing==="right"?25:24;
  const footByColumn=new Uint8Array(48);
  for(let x=0;x<48;x++)for(let y=71;y>=foot-13;y--)if(p[(y*48+x)*4+3]!>80){footByColumn[x]=y;break;}
  const colors = {hairColor:rgb(palettes.hairColor[a.hairColor]),top:rgb(palettes.top[a.top]),bottom:rgb(palettes.bottom[a.bottom]),shoes:rgb(palettes.shoes[a.shoes])};
  for(let y=0;y<72;y++)for(let x=0;x<48;x++) {
    const i=(y*48+x)*4,r=p[i]!,g=p[i+1]!,b=p[i+2]!;
    if(p[i+3]!<35)continue;
    const skin=r>155&&g>95&&r>g*1.08&&r>b*1.22;
    const hair=y>=top-2&&y<=top+16&&Math.abs(x-center)<13&&!skin&&r>g*1.12&&r>b*.95;
    let channel:keyof typeof colors|undefined;
    if(hair)channel="hairColor";
    // Each leg has its own baseline, so a raised shoe keeps its color during
    // the stride instead of inheriting the trouser palette of the lower leg.
    else if(y>=foot-13&&footByColumn[x]&&y>=footByColumn[x]!-3&&Math.abs(x-center)<12)channel="shoes";
    else if(y>=foot-12&&Math.abs(x-center)<10)channel="bottom";
    else if(y>=top+21&&y<foot-12&&Math.abs(x-center)<7&&!skin)channel="top";
    if(!channel||a[channel]==="original")continue;
    const lum=.3*r+.59*g+.11*b;
    if(lum<28)continue; // preserve original outline
    const shade=Math.max(.28,Math.min(1.4,lum/(channel==="hairColor"?102:117)));
    for(let k=0;k<3;k++)p[i+k]=Math.min(255,Math.round(colors[channel][k]!*shade));
  }
  // A slightly shaped waist differentiates the body without moving feet/hands.
  if(a.gender==="female")for(let y=Math.max(top+26,foot-20);y<foot-12;y++) {
    for(const side of [-1,1]){
      const x=center+side*7,i=(y*48+x)*4,next=(y*48+x+side)*4;
      if(p[next+3]!<30)p[i+3]=0;
    }
  }
  if(a.hair==="short")for(let y=top-3;y<top+3;y++)for(let x=0;x<48;x++){
    if(y>=0&&Math.abs(x-center)>5)p[(y*48+x)*4+3]=0;
  }
  c.putImageData(data,0,0);
  if(a.hair==="original"||a.hair==="short")return;
  const color=palettes.hairColor[a.hairColor],shade=rgb(color).map(v=>Math.round(v*.63));
  const dark=`rgb(${shade.join(",")})`;
  const polygon=(points:number[][],fill:string)=>{
    c.fillStyle=fill;c.beginPath();points.forEach(([x,y],i)=>i?c.lineTo(x!,y!):c.moveTo(x!,y!));c.closePath();c.fill();
  };
  const tail=(x:number,y:number,length:number,width:number,wave=false)=>{
    polygon([[x,y],[x+width,y],[x+width+1,y+length-4],[x+width-1,y+length],[x+1,y+length-1],[x-1,y+3]],dark);
    c.fillStyle=color;
    for(let j=1;j<length-2;j++)c.fillRect(x+1+(wave?Math.round(Math.sin(j*.7)):0),y+j,Math.max(2,width-2),1);
  };
  c.globalCompositeOperation="destination-over";
  if(["long","wave","bob"].includes(a.hair)) {
    const length=a.hair==="bob"?13:a.hair==="long"?24:22;
    tail(center-11,top+8,length,5,a.hair==="wave");
    tail(center+7,top+8,length,5,a.hair==="wave");
  }
  if(a.hair==="ponytail") {
    const x=facing==="left"?center+10:facing==="right"?center-14:center+6;
    tail(x,top+8,23,5,true);
    c.fillStyle="#d79b8b";c.fillRect(x,top+10,5,2);
  }
  if(a.hair==="bun") {
    const x=facing==="left"?center+7:facing==="right"?center-13:center-3;
    polygon([[x,top+4],[x-1,top],[x+1,top-4],[x+6,top-4],[x+9,top],[x+7,top+6]],dark);
    c.fillStyle=color;c.fillRect(x+1,top-2,5,6);
    c.fillStyle="#d9ba84";c.fillRect(x,top+3,7,1);
  }
  c.globalCompositeOperation="source-over";
  if(facing==="up"&&(a.hair==="long"||a.hair==="wave"))tail(center-6,top+13,20,12,a.hair==="wave");
  if(a.hair==="parted") {
    c.fillStyle=dark;c.fillRect(center+1,top+2,1,8);
    c.fillStyle=color;c.fillRect(center+2,top+3,4,2);
  }
  // On back views the tied hair belongs in front of the shirt, below the head.
  if(facing==="up"&&a.hair==="ponytail")tail(center+1,top+14,17,5,true);
}

type Bank={keys:Set<string>;used:number};
const banks=new WeakMap<Phaser.Scene,Map<string,Bank>>();
/** On-demand textures for only the appearances seen in this scene, not every
 * combination. Retire inactive banks after 30 seconds; keep active peers. */
export function appearanceTexture(scene:Phaser.Scene,base:string,value?:Appearance):string {
  const a=appearanceOf(value);if(original(a))return base;
  const signature=appearanceKey(a),key=`outfit-${signature}-${base}`;
  let cache=banks.get(scene);if(!cache){cache=new Map();banks.set(scene,cache);}
  let bank=cache.get(signature);if(!bank){bank={keys:new Set(),used:0};cache.set(signature,bank);}
  bank.used=performance.now();
  if(scene.textures.exists(key))return key;
  const source=scene.textures.get(base).getSourceImage() as HTMLImageElement|HTMLCanvasElement;
  const canvas=document.createElement("canvas");canvas.width=source.width;canvas.height=source.height;
  const dest=canvas.getContext("2d")!;
  const frame=document.createElement("canvas");frame.width=48;frame.height=72;
  const c=frame.getContext("2d")!;
  const directions:Facing[]=["down","up","left","right"];
  if(base==="player") {
    for(let row=0;row<3;row++)for(let col=0;col<16;col++) {
      paintCharacterFrame(c,source,col*48,row*72,a,directions[Math.floor(col/4)]!);dest.drawImage(frame,col*48,row*72);
    }
    const texture=scene.textures.addCanvas(key,canvas)!;
    for(let row=0;row<3;row++)for(let col=0;col<16;col++)texture.add(row*16+col,0,col*48,row*72,48,72);
  } else {
    const facing=directions.find(d=>base.includes(`-${d}-`))??"down";
    paintCharacterFrame(c,source,0,0,a,facing);dest.drawImage(frame,0,0);
    scene.textures.addCanvas(key,canvas);
  }
  scene.textures.get(key).setFilter(0);bank.keys.add(key);
  for(const [id,b] of cache)if(id!==signature&&performance.now()-b.used>30000){
    for(const old of b.keys)scene.textures.remove(old);cache.delete(id);
  }
  return key;
}
