import type Phaser from "phaser";
/** Original open harvest crate: sloped interior, broad plank front, hinged lid
 * and produce emblem. Drawn independently of the chest/lock artwork. */
export function paintShipping(c:CanvasRenderingContext2D):void {
  const poly=(points:number[][],color:string)=>{c.fillStyle=color;c.beginPath();points.forEach(([x,y],i)=>i?c.lineTo(x!,y!):c.moveTo(x!,y!));c.closePath();c.fill();};
  c.fillStyle="#30452d35";c.beginPath();c.ellipse(40,64,38,6,0,0,Math.PI*2);c.fill();
  poly([[7,19],[16,3],[70,7],[73,25]],"#63472e");
  poly([[11,18],[19,7],[67,10],[69,23]],"#d7ae65");
  for(let y=10;y<22;y+=5){c.strokeStyle="#a67844";c.lineWidth=1.5;c.beginPath();c.moveTo(16,y);c.lineTo(68,y+3);c.stroke();}
  poly([[4,31],[19,20],[75,29],[64,43]],"#e5c38a");
  poly([[10,31],[22,25],[68,31],[61,38]],"#5e4930");
  for(const [x,y,color] of [[25,30,"#dca84d"],[34,32,"#afca68"],[48,32,"#d46f4e"],[57,32,"#c5d67a"]] as const){c.fillStyle=color;c.beginPath();c.ellipse(x,y,7,5,0,0,Math.PI*2);c.fill();}
  poly([[4,31],[64,40],[64,65],[7,55]],"#b58049");
  poly([[64,40],[75,29],[73,54],[64,65]],"#805a36");
  poly([[5,31],[64,40],[64,45],[6,36]],"#efd39c");
  for(const y of [43,51]){c.strokeStyle="#80572f";c.lineWidth=1.5;c.beginPath();c.moveTo(8,y);c.lineTo(62,y+9);c.stroke();}
  poly([[11,37],[16,38],[17,57],[12,56]],"#e0b979");
  poly([[54,43],[59,44],[59,63],[54,62]],"#e0b979");
  poly([[26,42],[46,45],[46,60],[26,57]],"#f6e9b9");
  c.fillStyle="#dd8541";c.beginPath();c.ellipse(36,52,6,5,.12,0,Math.PI*2);c.fill();
  poly([[35,48],[32,43],[37,46],[42,43],[39,49]],"#678744");
  c.fillStyle="#f9e1a6";for(const [x,y] of [[13,40],[14,53],[56,46],[56,58]])c.fillRect(x!,y!,2,2);
}
let icon:string|undefined;
export function shippingIconSource():string {
  if(icon)return icon;const c=document.createElement("canvas");c.width=160;c.height=144;
  const context=c.getContext("2d")!;context.scale(2,2);paintShipping(context);return icon=c.toDataURL("image/png");
}
export function createShippingTexture(scene:Phaser.Scene):void {
  if(scene.textures.exists("shipping_crate"))return;
  const t=scene.textures.createCanvas("shipping_crate",160,144)!;t.context.scale(2,2);paintShipping(t.context);t.refresh();
}
