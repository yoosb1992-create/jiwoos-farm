/** Authored light anchors can be extended with lamps, torches or fairy lights
 * without changing the darkness compositor. Coordinates are world pixels. */
export interface WorldLight { x:number; y:number; radius:number; strength:number }
export function sceneryLight(asset:string,x:number,y:number):WorldLight|undefined {
  if (/^(house(?:_|$)|store(?:_|$)|work_shed|cafe|building-(house|store|work-shed))/.test(asset))
    return {x,y:y-10,radius:116,strength:.94};
  if (/^(rustic_lamp|farm-rustic-lamp|lamp|torch|fairy_light)/.test(asset))
    return {x,y:y-16,radius:90,strength:.9};
  return undefined;
}
/** A single reusable low-resolution canvas, capped lights, no shadow-ray scan. */
export function paintNightVeil(c:CanvasRenderingContext2D,w:number,h:number,darkness:number,
  lights:readonly WorldLight[]):void {
  c.clearRect(0,0,w,h);c.globalCompositeOperation="source-over";
  c.fillStyle=`rgba(3,7,17,${darkness})`;c.fillRect(0,0,w,h);
  c.globalCompositeOperation="destination-out";
  for(const light of lights){
    const {x,y,radius:r,strength}=light;
    const gradient=c.createRadialGradient(x,y,0,x,y,r);
    gradient.addColorStop(0,`rgba(0,0,0,${strength})`);
    gradient.addColorStop(.22,`rgba(0,0,0,${strength*.85})`);
    gradient.addColorStop(.65,`rgba(0,0,0,${strength*.3})`);
    gradient.addColorStop(1,"rgba(0,0,0,0)");
    c.fillStyle=gradient;c.fillRect(x-r,y-r,r*2,r*2);
  }
  c.globalCompositeOperation="source-over";
}
