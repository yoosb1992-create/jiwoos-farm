import Phaser from "phaser";
import { actionTiming, toolMotion, type ActionFx, type ToolMotion } from "../shared/interaction.js";
import type { Facing } from "../shared/world.js";

export type Point={x:number;y:number};
type Pose={reach:number;side:number;height:number;angle:number;lean:number;bend:number;shift:number;twist:number;alpha:number};
type Key={at:number;pose:Pose};
const pose=(reach:number,side:number,height:number,angle:number,lean=0,bend=0,shift=0,twist=1,alpha=1):Pose=>({reach,side,height,angle,lean,bend,shift,twist,alpha});
const smooth=(t:number)=>t*t*(3-2*t);
const lerp=(a:number,b:number,t:number)=>a+(b-a)*t;
export const facingVector=(f:Facing):Point=>({x:f==="left"?-1:f==="right"?1:0,y:f==="up"?-1:f==="down"?1:0});
/** Exact coordinates in the 64px generated tool art. Both hands and the water
 * stream use this same transform as the tool sprite. No free-floating overlay. */
export const TOOL_ANCHORS={
  axe:{grip:{x:26,y:52},second:{x:29,y:40},tip:{x:51,y:19}},
  pickaxe:{grip:{x:26,y:52},second:{x:29,y:39},tip:{x:54,y:20}},
  scythe:{grip:{x:26,y:52},second:{x:28,y:39},tip:{x:52,y:29}},
  hoe:{grip:{x:26,y:52},second:{x:29,y:40},tip:{x:47,y:28}},
  water:{grip:{x:22,y:25},second:{x:37,y:43},tip:{x:59,y:31}},
} as const;
const TOOL_SCALE=.64;

/** A small, pooled actor rig. The feet remain planted; hips, torso and head
 * transfer weight separately, and two-bone arms end on authored tool grips. */
export class ToolAnimationRig {
  readonly legs:Phaser.GameObjects.Image;
  readonly torso:Phaser.GameObjects.Image;
  readonly head:Phaser.GameObjects.Image;
  readonly tool:Phaser.GameObjects.Image;
  readonly back:Phaser.GameObjects.Graphics;
  readonly front:Phaser.GameObjects.Graphics;
  readonly trail:Phaser.GameObjects.Graphics;
  readonly nozzle:Point={x:0,y:0};
  readonly contact:Point={x:0,y:0};
  readonly hands:Point[]=[{x:0,y:0},{x:0,y:0}];
  private keys:Key[]=[];
  private readonly sample=pose(0,0,0,0);
  private facing:Facing="down";
  private motion:ToolMotion="horizontal_chop";
  private impactAngle=0;
  private grip:Point={x:0,y:0};
  private fx!:ActionFx;
  private readonly tips:Point[]=[];
  constructor(private scene:Phaser.Scene) {
    this.legs=scene.add.image(0,0,"farmer-down-legs").setOrigin(.5,70/72).setScale(1.05);
    this.torso=scene.add.image(0,0,"farmer-down-torso").setOrigin(.5,58/72).setScale(1.05);
    this.head=scene.add.image(0,0,"farmer-down-head").setOrigin(.5,44/72).setScale(1.05);
    this.tool=scene.add.image(0,0,"held-axe");
    this.back=scene.add.graphics();this.front=scene.add.graphics();this.trail=scene.add.graphics();
    this.hide();
  }
  start(fx:ActionFx):void {
    this.fx=fx;this.facing=fx.facing;this.motion=toolMotion(fx);this.tips.length=0;
    const f=facingVector(fx.facing),t=actionTiming(fx),horizontal=this.motion==="horizontal_chop"||this.motion==="horizontal_cut";
    const tree=fx.target?.kind==="tree";
    const p=fx.point??fx.target??{x:fx.x+f.x*32,y:fx.y+f.y*32};
    // Contact the near surface, not a rock's invisible ground anchor.
    this.contact.x=p.x-f.x*(tree?5:7);
    this.contact.y=p.y-(tree?18:fx.target?.kind==="gather"?5:6)-f.y*(tree?0:7);
    const a=TOOL_ANCHORS[fx.tool==="hand"?"hoe":fx.tool];
    const nominal={x:fx.x+f.x*13,y:fx.y-23+f.y*8};
    const toward=Math.atan2(this.contact.y-nominal.y,this.contact.x-nominal.x);
    const base=Math.atan2(a.tip.y-a.grip.y,(a.tip.x-a.grip.x)*(fx.facing==="left"?-1:1));
    this.impactAngle=toward-base;
    const length=Math.hypot(a.tip.x-a.grip.x,a.tip.y-a.grip.y)*TOOL_SCALE;
    this.grip={x:this.contact.x-fx.x-Math.cos(toward)*length,y:this.contact.y-fx.y-Math.sin(toward)*length};
    const turn=fx.facing==="left"?-1:1;
    const rest=pose(2,fx.facing==="up"?-6:6,13,0,0,0,0,1,0);
    let ready:Pose,wind:Pose,hit:Pose,follow:Pose;
    if(horizontal) {
      const cut=this.motion==="horizontal_cut";
      ready=pose(-2,-8,cut?21:27,-turn*.45,-4,0,-1,.94);
      wind=pose(-5,-12,cut?24:35,-turn*(cut?1.25:.8),-9,-1,-2,.85);
      hit=pose(0,0,0,0,cut?8:12,cut?3:4,3,.92);
      follow=pose(13,cut?16:9,cut?17:24,turn*(cut?1.3:.45),cut?9:6,3,2,.9);
    } else if(this.motion==="watering"||this.motion==="refill") {
      ready=pose(7,4,26,0,0,0,0,1);
      wind=pose(12,3,30,turn*.08,3,2,1,1);
      hit=pose(17,2,29,turn*.45,7,4,2,.96);
      follow=pose(17,2,29,turn*.48,7,4,2,.96);
    } else if(this.motion==="hand_gather") {
      ready=pose(6,3,20,0,2,3,1,1);
      wind=pose(11,2,13,0,6,6,3,.95);
      hit=pose(20,0,4,0,13,12,5,.92);
      follow=pose(12,1,14,0,7,7,3,.96);
    } else {
      ready=pose(1,0,30,-turn*.2,-3,0,-1,.98);
      wind=pose(-2,0,47,-turn*.55,-9,-2,-2,.94);
      hit=pose(0,0,0,0,this.motion==="tilling"?17:13,fx.facing==="down"?9:5,3,.92);
      follow=this.motion==="tilling" ? pose(9,1,14,turn*.1,11,7,2,.96) : pose(8,0,25,-turn*.15,7,3,1,.97);
    }
    if(!["watering","refill","hand_gather"].includes(this.motion)) {
      // Author the actual contact as a keyframe, rather than blending a rotated
      // sprite toward it late in the swing. That keeps the wrist path continuous.
      const angle=wind.angle+Math.atan2(Math.sin(this.impactAngle-wind.angle),Math.cos(this.impactAngle-wind.angle));
      hit.reach=f.x?this.grip.x*f.x:0;hit.side=f.x?0:-this.grip.x*f.y;hit.height=-this.grip.y;hit.angle=angle;
      follow.reach=hit.reach+(horizontal?2:-4);follow.side=hit.side+(this.motion==="horizontal_cut"?12:0);
      follow.height=hit.height+(horizontal?-2:6);follow.angle=angle+turn*(horizontal?.35:-.22);
      rest.angle=angle+Math.atan2(Math.sin(-angle),Math.cos(-angle));
    }
    this.keys=[{at:0,pose:rest},{at:t.windup*.4,pose:ready},{at:t.windup,pose:wind},{at:t.impact,pose:hit},
      {at:t.impact+t.hold,pose:hit},{at:t.follow,pose:follow},{at:t.duration,pose:rest}];
    for(const [part,image] of [["head",this.head],["torso",this.torso],["legs",this.legs]] as const)
      image.setTexture(`farmer-${this.facing}-${part}`).setVisible(true);
    this.tool.setTexture(`held-${fx.tool==="hand"?"hoe":fx.tool}`).setOrigin(a.grip.x/64,a.grip.y/64).setScale(TOOL_SCALE).setVisible(fx.tool!=="hand");
  }
  private arm(g:Phaser.GameObjects.Graphics,sx:number,sy:number,h:Point,bend:number,alpha:number):void {
    const dx=h.x-sx,dy=h.y-sy,d=Math.max(.01,Math.hypot(dx,dy));
    // Two bone elbow, with the far/near arm bending to opposite sides. Tool and
    // wrist coordinates are never clamped independently (which breaks the grip).
    const reach=Math.max(9,d*.51),height=Math.sqrt(Math.max(0,reach*reach-d*d/4));
    const ex=(sx+h.x)/2-dy/d*height*bend,ey=(sy+h.y)/2+dx/d*height*bend;
    g.lineStyle(5,0x4a3026,alpha).lineBetween(sx,sy,ex,ey);
    g.lineStyle(3.5,0xd5b98a,alpha).lineBetween(sx,sy,ex,ey);
    g.lineStyle(1.3,0xf5e9c4,alpha).lineBetween(sx-.5,sy,ex-.5,ey);
    g.lineStyle(3.8,0x4a3026,alpha).lineBetween(ex,ey,h.x,h.y);
    g.lineStyle(2.5,0xe8ad81,alpha).lineBetween(ex,ey,h.x,h.y);
    g.fillStyle(0xffd3a3,alpha).fillCircle(h.x,h.y,1.8);
    g.lineStyle(1,0x78492e,alpha).lineBetween(h.x-1,h.y+2,h.x+2,h.y+2);
  }
  update(elapsed:number,x:number,y:number):void {
    const t=actionTiming(this.fx),f=facingVector(this.facing),p=this.sample;
    let index=1;while(index<this.keys.length-1 && elapsed>this.keys[index]!.at)index++;
    const prev=this.keys[index-1]!,next=this.keys[index]!;
    let q=Math.min(1,Math.max(0,(elapsed-prev.at)/Math.max(1,next.at-prev.at)));
    // Deliberately slow lift / fast strike, smooth wrists everywhere else.
    q=next.at===t.impact && this.motion!=="watering" ? q*q : smooth(q);
    for(const k of Object.keys(p) as Array<keyof Pose>)p[k]=lerp(prev.pose[k],next.pose[k],q);
    const side=this.facing==="left"?-1:1,vertical=f.x===0;
    const bodyX=x+f.x*p.shift,hipY=y-12+p.bend*.2+f.y*p.shift*.6;
    const lean=(vertical?side*.28:side)*p.lean*Math.PI/180;
    const torsoY=hipY+p.bend*.35;
    this.legs.setPosition(x,y).setScale(1.05,1.05-p.bend*.003).setDepth(y+.01);
    this.torso.setPosition(bodyX,torsoY).setRotation(lean).setScale(1.05*p.twist,1.05-p.bend*.006).setDepth(y+.03);
    const neckX=bodyX+Math.sin(lean)*14,neckY=torsoY-Math.cos(lean)*14+p.bend*.2;
    this.head.setPosition(neckX,neckY).setRotation(lean*.6).setScale(1.05).setDepth(y+.08);
    const restGrip={x:x+f.x*p.reach-f.y*p.side,y:y+f.y*p.reach*.62+f.x*p.side*.35-p.height};
    const useContact= !["watering","refill","hand_gather"].includes(this.motion);
    const a=TOOL_ANCHORS[this.fx.tool==="hand"?"hoe":this.fx.tool];
    const gx=restGrip.x,gy=restGrip.y;
    let rotation=p.angle;
    if(this.fx.tool==="water") {
      // The can is upright in hand; its spout, not its centre, tilts toward water.
      rotation=this.facing==="left" ? p.angle : this.facing==="up" ? -1.2+p.angle*.2 : this.facing==="down" ? .8+p.angle*.3 : p.angle;
    }
    this.tool.setPosition(gx,gy).setRotation(rotation).setAlpha(p.alpha);
    const up=this.facing==="up";
    this.tool.setDepth(up?y+.015:y+.11);
    const mirror=this.facing==="left";
    this.tool.setScale(mirror?-TOOL_SCALE:TOOL_SCALE,TOOL_SCALE);
    const transform=(point:Point,out:Point)=>{
      const px=(point.x-a.grip.x)*TOOL_SCALE*(mirror?-1:1),py=(point.y-a.grip.y)*TOOL_SCALE;
      out.x=gx+px*Math.cos(rotation)-py*Math.sin(rotation);out.y=gy+px*Math.sin(rotation)+py*Math.cos(rotation);
    };
    this.hands[0]!.x=gx;this.hands[0]!.y=gy;transform(a.second,this.hands[1]!);transform(a.tip,this.nozzle);
    if(this.fx.tool==="hand") {
      this.hands[1]!.x=bodyX+(vertical?7:side*-3);this.hands[1]!.y=hipY+1;
    }
    const back=this.back.clear().setDepth(up?y+.018:y+.02),front=this.front.clear().setDepth(up?y+.04:y+.12);
    const blend=Math.max(0,Math.min(1,elapsed/55,(t.duration-elapsed)/100));
    for(const part of [this.legs,this.torso,this.head])part.setAlpha(blend);
    back.setAlpha(blend);front.setAlpha(blend);
    const shoulderY=torsoY-12;
    this.arm(back,bodyX+(vertical?-7:-side*2),shoulderY,this.hands[1]!,up?-1:1,1);
    this.arm(front,bodyX+(vertical?7:side*4),shoulderY+1,this.hands[0]!,up?1:-1,1);
    if(up) {
      // The upper back/head occlude hands crossing behind the shoulders.
      this.torso.setDepth(y+.045);this.head.setDepth(y+.08);
    }
    const g=this.trail.clear().setDepth(up?y+.025:y+.13);
    if(useContact && elapsed>t.windup && elapsed<t.impact+t.hold+60) {
      this.tips.push({x:this.nozzle.x,y:this.nozzle.y});if(this.tips.length>6)this.tips.shift();
      for(let i=1;i<this.tips.length;i++) {
        const u=this.tips[i-1]!,v=this.tips[i]!;
        g.lineStyle(this.fx.tool==="scythe"?2.5:1.5,0xf7eac1,.36*i/this.tips.length).lineBetween(u.x,u.y,v.x,v.y);
      }
    }
    if(this.fx.tool==="water" && this.fx.outcome!=="fail" && this.motion==="watering" && elapsed>t.impact-70 && elapsed<t.follow) {
      const end=this.fx.point??this.contact;
      for(let i=0;i<12;i++) {
        const age=elapsed-(t.impact-70)-i*8;
        if(age<0)continue;
        const u=(age%96)/70;if(u>1)continue;
        const sx=this.nozzle.x,sy=this.nozzle.y;
        const wx=lerp(sx,end.x,u)+Math.sin(i*2.4)*u*3,wy=lerp(sy,end.y-2,u)-Math.sin(u*Math.PI)*7;
        g.fillStyle(i%2?0xc4f2f2:0x72c6dc,.8).fillEllipse(wx,wy,1.8,2.5);
      }
      const splash=(elapsed-t.impact)/110;
      if(splash>=0)for(let i=0;i<3;i++) {
        const u=(splash+i/3)%1;
        g.lineStyle(.8,0xb0e0df,(1-u)*.6).strokeEllipse(end.x+(i-1)*5,end.y,3+u*9,1+u*4);
      }
    }
  }
  hide():void {for(const image of [this.legs,this.torso,this.head,this.tool])image.setVisible(false);this.back.clear();this.front.clear();this.trail.clear();}
  destroy():void {for(const image of [this.legs,this.torso,this.head,this.tool,this.back,this.front,this.trail])image.destroy();}
}
