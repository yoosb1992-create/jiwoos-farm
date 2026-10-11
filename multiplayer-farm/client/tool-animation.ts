import Phaser from "phaser";
import { actionTiming, toolMotion, type ActionFx, type ToolMotion, type ToolTiming } from "../shared/interaction.js";
import type { Facing } from "../shared/world.js";
import { FARMER_FRAMES, farmerKey, farmerGround, type FarmerPose } from "./tool-animation-art.js";

export type Point={x:number;y:number};
const lerp=(a:number,b:number,t:number)=>a+(b-a)*t;
const clamp=(n:number)=>Math.max(0,Math.min(1,n));
const smooth=(n:number)=>{const t=clamp(n);return t*t*(3-2*t);};
const nearestAngle=(from:number,to:number)=>from+Math.atan2(Math.sin(to-from),Math.cos(to-from));
export const facingVector=(f:Facing):Point=>({x:f==="left"?-1:f==="right"?1:0,y:f==="up"?-1:f==="down"?1:0});
export const TOOL_ANCHORS={
  axe:{grip:{x:26,y:52},second:{x:29,y:40},tip:{x:47.04,y:18.56}},
  pickaxe:{grip:{x:26,y:52},second:{x:29,y:39},tip:{x:49.38,y:19.34}},
  scythe:{grip:{x:26,y:52},second:{x:28,y:39},tip:{x:47.82,y:26.36}},
  hoe:{grip:{x:26,y:52},second:{x:29,y:40},tip:{x:43.92,y:25.58}},
  water:{grip:{x:22,y:25},second:{x:37,y:43},tip:{x:59,y:31}},
} as const;

type PoseKey={at:number;pose:FarmerPose};
/** Original, whole-character sprite poses. The rig owns no joints, synthetic
 * arms or replacement clothing. Every tool grip follows the authored palm,
 * including the discrete frame changes of the original pixel animation. */
export class ToolAnimationRig {
  readonly body:Phaser.GameObjects.Image;
  readonly palm:Phaser.GameObjects.Image;
  readonly tool:Phaser.GameObjects.Image;
  readonly trail:Phaser.GameObjects.Graphics;
  readonly nozzle:Point={x:0,y:0};
  readonly contact:Point={x:0,y:0};
  readonly hands:Point[]=[{x:0,y:0},{x:0,y:0}];
  private fx!:ActionFx;
  private motion:ToolMotion="horizontal_chop";
  private keys:PoseKey[]=[];
  private impactAngle=0;
  private windAngle=0;
  private scale=.64;
  private readonly tips:Point[]=[];
  private currentPose:FarmerPose="idle";
  constructor(private scene:Phaser.Scene) {
    this.body=scene.add.image(0,0,farmerKey("down","idle")).setOrigin(.5,70/72).setScale(1.05);
    this.palm=scene.add.image(0,0,`${farmerKey("down","idle")}-palm`).setOrigin(.5,70/72).setScale(1.05);
    this.tool=scene.add.image(0,0,"held-axe");
    this.trail=scene.add.graphics();this.hide();
  }
  start(fx:ActionFx):void {
    this.fx=fx;this.motion=toolMotion(fx);this.tips.length=0;
    const t=actionTiming(fx),f=facingVector(fx.facing),tree=fx.target?.kind==="tree";
    const p=fx.point??fx.target??{x:fx.x+f.x*32,y:fx.y+f.y*32};
    this.contact.x=p.x-f.x*(tree?5:7);
    this.contact.y=p.y-(tree?18:fx.target?.kind==="gather"?12:6)-f.y*(tree?0:7);
    const horizontal=this.motion==="horizontal_chop"||this.motion==="horizontal_cut";
    if(this.motion==="watering"||this.motion==="refill") {
      this.keys=[{at:0,pose:"idle"},{at:80,pose:"carry"},{at:t.windup,pose:"strike"},
        {at:t.follow,pose:"carry"},{at:t.duration-85,pose:"idle"}];
    } else if(this.motion==="hand_gather") {
      this.keys=[{at:0,pose:"idle"},{at:70,pose:"carry"},{at:t.windup,pose:"strike"},
        {at:t.impact,pose:"bow"},{at:t.follow,pose:"strike"},{at:t.duration-80,pose:"idle"}];
    } else if(horizontal) {
      this.keys=[{at:0,pose:"idle"},{at:t.windup*.28,pose:"carry"},
        {at:t.windup*.65,pose:this.motion==="horizontal_cut"?"strike":"raised"},
        {at:t.impact-28,pose:"carry"},{at:t.impact+t.hold+35,pose:"strike"},
        {at:t.follow+45,pose:"carry"},{at:t.duration-60,pose:"idle"}];
    } else {
      this.keys=[{at:0,pose:"idle"},{at:t.windup*.28,pose:"carry"},{at:t.windup*.62,pose:"raised"},
        {at:t.impact-35,pose:"strike"},{at:t.impact,pose:"bow"},
        {at:t.follow,pose:"strike"},{at:t.follow+70,pose:"carry"},{at:t.duration-50,pose:"idle"}];
    }
    this.keys.sort((a,b)=>a.at-b.at);
    const frame=FARMER_FRAMES[fx.facing][this.poseAt(t.impact)];
    const a=TOOL_ANCHORS[fx.tool==="hand"?"hoe":fx.tool];
    const hx=fx.x+(frame.hand[0]-24)*1.05,hy=fx.y+(frame.hand[1]-farmerGround(fx.facing,this.poseAt(t.impact)))*1.05;
    const mx=fx.facing==="left"?-1:1;
    const base=Math.atan2(a.tip.y-a.grip.y,(a.tip.x-a.grip.x)*mx);
    const toward=Math.atan2(this.contact.y-hy,this.contact.x-hx);
    this.impactAngle=toward-base;
    // Change the tool's size once for the near surface, never stretch an arm.
    this.scale=fx.tool==="water"?.52:Math.max(.38,Math.min(1.35,Math.hypot(this.contact.x-hx,this.contact.y-hy)/Math.hypot(a.tip.x-a.grip.x,a.tip.y-a.grip.y)));
    const wind=horizontal ? this.impactAngle-mx*(this.motion==="horizontal_cut"?1.7:1.1) : -Math.PI/2-base;
    this.windAngle=nearestAngle(this.impactAngle,wind);
    this.tool.setTexture(`held-${fx.tool==="hand"?"hoe":fx.tool}`).setOrigin(a.grip.x/64,a.grip.y/64);
    this.body.setVisible(true);this.palm.setVisible(true);
  }
  private poseAt(elapsed:number):FarmerPose {
    let pose:FarmerPose="idle";
    for(const key of this.keys){if(elapsed<key.at)break;pose=key.pose;}
    return pose;
  }
  private angleAt(elapsed:number,t:ToolTiming):number {
    const mx=this.fx.facing==="left"?-1:1;
    if(this.fx.tool==="water") {
      const upright=this.fx.facing==="up"?-1.05:this.fx.facing==="down"?.6:0;
      const tilt=smooth((elapsed-t.windup*.6)/(t.impact-t.windup*.6))*(1-smooth((elapsed-t.follow)/(t.duration-t.follow)));
      return upright+mx*tilt*.38;
    }
    if(elapsed<t.windup)return lerp(this.windAngle+mx*.35,this.windAngle,smooth(elapsed/t.windup));
    if(elapsed<t.impact){const q=clamp((elapsed-t.windup)/(t.impact-t.windup));return lerp(this.windAngle,this.impactAngle,q*q);}
    if(elapsed<t.impact+t.hold)return this.impactAngle;
    const follow=this.impactAngle+mx*(this.motion==="horizontal_cut"?.8:this.motion==="horizontal_chop"?.24:-.16);
    if(elapsed<t.follow)return lerp(this.impactAngle,follow,smooth((elapsed-t.impact-t.hold)/(t.follow-t.impact-t.hold)));
    return lerp(follow,nearestAngle(follow,this.windAngle+mx*.35),smooth((elapsed-t.follow)/(t.duration-t.follow)));
  }
  update(elapsed:number,x:number,y:number):void {
    const t=actionTiming(this.fx),f=this.fx.facing,up=f==="up",pose=this.poseAt(elapsed);
    const key=farmerKey(f,pose),frame=FARMER_FRAMES[f][pose];
    this.currentPose=pose;
    // A small whole-body weight shift retains face proportions and source colors.
    // No separately rotated head, squeezed torso, elastic shoulder or elbow.
    const recovery=1-smooth((elapsed-t.follow)/(t.duration-t.follow));
    const shift=Math.sin(clamp(elapsed/t.duration)*Math.PI)*recovery;
    const bx=x+(f==="left"?-1:f==="right"?1:0)*shift,by=y;
    const ground=farmerGround(f,pose);
    this.body.setTexture(key).setOrigin(.5,ground/72).setPosition(bx,by).setDepth(y+.03).setAlpha(1);
    this.palm.setTexture(`${key}-palm`).setOrigin(.5,ground/72).setPosition(bx,by).setDepth(y+.12).setAlpha(1).setVisible(!up&&pose!=="idle");
    const gx=bx+(frame.hand[0]-24)*1.05,gy=by+(frame.hand[1]-ground)*1.05;
    const a=TOOL_ANCHORS[this.fx.tool==="hand"?"hoe":this.fx.tool],mirror=f==="left"?-1:1,rotation=this.angleAt(elapsed,t);
    const alpha=Math.min(smooth(elapsed/65),smooth((t.duration-elapsed)/70));
    this.tool.setPosition(gx,gy).setRotation(rotation).setScale(mirror*this.scale,this.scale).setDepth(up?y+.02:y+.11).setAlpha(alpha).setVisible(this.fx.tool!=="hand");
    const transform=(point:Point,out:Point)=>{
      const px=(point.x-a.grip.x)*this.scale*mirror,py=(point.y-a.grip.y)*this.scale;
      out.x=gx+px*Math.cos(rotation)-py*Math.sin(rotation);out.y=gy+px*Math.sin(rotation)+py*Math.cos(rotation);
    };
    this.hands[0]!.x=gx;this.hands[0]!.y=gy;transform(a.second,this.hands[1]!);transform(a.tip,this.nozzle);
    const g=this.trail.clear().setDepth(up?y+.025:y+.13);
    if(this.fx.tool!=="water"&&this.fx.tool!=="hand"&&elapsed>t.windup&&elapsed<t.impact+t.hold+55) {
      this.tips.push({x:this.nozzle.x,y:this.nozzle.y});if(this.tips.length>6)this.tips.shift();
      for(let i=1;i<this.tips.length;i++) {
        const u=this.tips[i-1]!,v=this.tips[i]!;
        g.lineStyle(this.fx.tool==="scythe"?2.5:1.3,0xf7eac1,.32*i/this.tips.length).lineBetween(u.x,u.y,v.x,v.y);
      }
    }
    if(this.fx.tool==="water"&&this.motion==="watering"&&elapsed>t.impact-70&&elapsed<t.follow) {
      const end=this.fx.point??this.contact;
      for(let i=0;i<12;i++) {
        const age=elapsed-(t.impact-70)-i*8;if(age<0)continue;
        const u=(age%96)/70;if(u>1)continue;
        g.fillStyle(i%2?0xc4f2f2:0x72c6dc,.8).fillEllipse(lerp(this.nozzle.x,end.x,u)+Math.sin(i*2.4)*u*3,
          lerp(this.nozzle.y,end.y-2,u)-Math.sin(u*Math.PI)*7,1.8,2.5);
      }
      const splash=(elapsed-t.impact)/110;
      if(splash>=0)for(let i=0;i<3;i++) {
        const u=(splash+i/3)%1;g.lineStyle(.8,0xb0e0df,(1-u)*.6).strokeEllipse(end.x+(i-1)*5,end.y,3+u*9,1+u*4);
      }
    }
  }
  hide():void {this.body.setVisible(false);this.palm.setVisible(false);this.tool.setVisible(false);this.trail.clear();}
  destroy():void {this.body.destroy();this.palm.destroy();this.tool.destroy();this.trail.destroy();}
}
