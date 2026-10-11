import Phaser from "phaser";
import type { Facing } from "../shared/world.js";

export type FarmerPose = "idle" | "raised" | "strike" | "bow" | "carry";
type Frame = { column:number; row:number; hand:readonly[number,number]; erase?:readonly (readonly number[])[] };
/** Authored pixels from the ORIGINAL farmer atlas, not the differently dressed
 * inplay-polish farmer. Masks remove only the baked-in hoe outside the hands.
 * No head/body splitting, outfit repainting, two-bone arms or generated skin. */
export const FARMER_FRAMES:Record<Facing,Record<FarmerPose,Frame>> = {
  down:{
    idle:{column:0,row:0,hand:[31,56]},
    raised:{column:0,row:2,hand:[24,27],erase:[[0,0,48,0,48,23,0,23]]},
    strike:{column:1,row:2,hand:[23,54],erase:[[23,57,26,57,26,65,23,65],[0,65,48,65,48,72,0,72]]},
    bow:{column:2,row:2,hand:[23,55],erase:[[23,57,26,57,26,63,23,63],[0,62,48,62,48,72,0,72]]},
    carry:{column:3,row:2,hand:[28,50],erase:[[28,53,31,53,48,63,48,72,29,72,29,59],[26,65,48,65,48,72,26,72]]},
  },
  up:{
    idle:{column:4,row:0,hand:[18,51]},
    raised:{column:4,row:2,hand:[21,27],erase:[[0,0,48,0,48,24,0,24]]},
    strike:{column:5,row:2,hand:[25,49],erase:[[29,58,35,58,35,72,29,72]]},
    // The source's third up frame faces sideways. Reuse the genuine back view.
    bow:{column:5,row:2,hand:[25,49],erase:[[29,58,35,58,35,72,29,72]]},
    carry:{column:4,row:0,hand:[18,51]},
  },
  left:{
    idle:{column:8,row:0,hand:[26,56]},
    raised:{column:8,row:2,hand:[15,29],erase:[[0,0,48,0,48,24,0,24],[34,55,48,55,48,72,34,72]]},
    strike:{column:9,row:2,hand:[13,58],erase:[[0,61,22,61,22,72,0,72],[0,59,10,57,12,61,0,61]]},
    bow:{column:10,row:2,hand:[15,58],erase:[[0,61,21,61,21,72,0,72]]},
    carry:{column:11,row:2,hand:[21,52],erase:[[0,59,19,53,22,55,17,61,21,65,21,72,0,72]]},
  },
  right:{
    idle:{column:12,row:0,hand:[21,56]},
    raised:{column:12,row:2,hand:[31,37],erase:[[32,0,48,0,48,35,33,35,34,27,31,27,31,20,0,20,0,0]]},
    strike:{column:13,row:2,hand:[28,57],erase:[[30,58,48,60,48,72,28,72,28,60]]},
    // The third right frame is facing left in the shipped atlas; never flip the
    // actor's face mid-action. The correctly facing strike already has a bow.
    bow:{column:13,row:2,hand:[28,57],erase:[[30,58,48,60,48,72,28,72,28,60]]},
    carry:{column:15,row:2,hand:[29,53],erase:[[31,55,48,60,48,72,28,72,28,60]]},
  },
};
export const farmerKey=(facing:Facing,pose:FarmerPose)=>`farmer-action-${facing}-${pose}`;
const groundLines=new Map<string,number>();
export const farmerGround=(facing:Facing,pose:FarmerPose)=>groundLines.get(farmerKey(facing,pose))??70;

/** Twenty tiny cached frames. All visible RGB samples are copied verbatim from
 * the shipped atlas. Palms are copied a second time solely to occlude the grip. */
export function createFarmerFrames(scene:Phaser.Scene):void {
  const source=scene.textures.get("player").getSourceImage() as HTMLImageElement;
  for(const facing of ["down","up","left","right"] as const)for(const pose of ["idle","raised","strike","bow","carry"] as const) {
    const key=farmerKey(facing,pose),f=FARMER_FRAMES[facing][pose];
    if(scene.textures.exists(key))continue;
    const t=scene.textures.createCanvas(key,48,72)!,c=t.context;
    c.imageSmoothingEnabled=false;
    c.drawImage(source,f.column*48,f.row*72,48,72,0,0,48,72);
    c.globalCompositeOperation="destination-out";
    for(const polygon of f.erase??[]) {
      c.beginPath();c.moveTo(polygon[0]!,polygon[1]!);
      for(let i=2;i<polygon.length;i+=2)c.lineTo(polygon[i]!,polygon[i+1]!);
      c.closePath();c.fill();
    }
    c.globalCompositeOperation="source-over";
    const data=c.getImageData(0,0,48,72),pixels=data.data;
    // Tiny disconnected flecks are remnants of the baked hoe's outline, not
    // part of the actor. Keep the one connected farmer silhouette verbatim.
    const seen=new Uint8Array(48*72);
    for(let start=0;start<seen.length;start++) {
      if(seen[start]||pixels[start*4+3]!<16)continue;
      const component=[start];seen[start]=1;
      for(let j=0;j<component.length;j++) {
        const i=component[j]!,x=i%48,y=Math.floor(i/48);
        for(const n of [x>0?i-1:-1,x<47?i+1:-1,y>0?i-48:-1,y<71?i+48:-1])
          if(n>=0&&!seen[n]&&pixels[n*4+3]!>=16){seen[n]=1;component.push(n);}
      }
      if(component.length<8)for(const i of component)pixels[i*4+3]=0;
    }
    c.putImageData(data,0,0);
    let ground=70;
    if(pose!=="idle") {
      // The normal sprite's 70/72 origin leaves two foot pixels below its
      // world anchor. Match that baseline exactly through every action pose.
      outer:for(let y=71;y>=50;y--)for(let x=12;x<33;x++)if(pixels[(y*48+x)*4+3]!>48){ground=y-1;break outer;}
    }
    groundLines.set(key,ground);
    t.refresh();t.setFilter(Phaser.Textures.FilterMode.NEAREST);
    const palm=scene.textures.createCanvas(`${key}-palm`,48,72)!;
    // Preserve the source's own knuckles/outline in front of the handle.
    palm.context.drawImage(t.canvas,f.hand[0]-2,f.hand[1]-2,4,4,f.hand[0]-2,f.hand[1]-2,4,4);
    palm.refresh();palm.setFilter(Phaser.Textures.FilterMode.NEAREST);
  }
}
