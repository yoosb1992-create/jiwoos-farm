import Phaser from "phaser";
import { ASSETS, TILE } from "../shared/content.js";
import { visualSize } from "../shared/art-assets.js";
import { treeSprite, inferSpecies, treeSeasonScale } from "../shared/nature.js";
import { impactDelay, breakDuration, dropAppearDelay, DROP_SETTLE_MS, actionTiming, type ActionFx } from "../shared/interaction.js";
import type { RenderPlayer } from "./network.js";
import type { Season } from "../shared/expansion.js";
import type { Sound } from "./audio.js";
import { ToolAnimationRig } from "./tool-animation.js";
import { naturalFlower } from "../shared/resources.js";

type View = {body:Phaser.GameObjects.Sprite;label:Phaser.GameObjects.Text;x:number;y:number};
type Particle = {sprite:Phaser.GameObjects.Image;start:number;life:number;x:number;y:number;vx:number;vy:number;color:number};
type Swing = {event:ActionFx;start:number;impacted:boolean;rig:ToolAnimationRig;whooshed:boolean};
type Ghost = {sprites:Phaser.GameObjects.Sprite[];scales:Array<{x:number;y:number}>;event:ActionFx;start:number;duration:number;impact:boolean};
type DropMotion = {start:number;dx:number;dy:number;shadow?:Phaser.GameObjects.Ellipse};
type Attraction = {sprite:Phaser.GameObjects.Sprite;shadow:Phaser.GameObjects.Ellipse;event:ActionFx;start:number;x:number;y:number};

/** Bounded, local-only animation state. No physics bodies, per-object timers,
 * per-frame network messages or permanent tweens on offscreen natural objects. */
export class FarmFeedback {
  private seen = new Set<string>();
  private swings = new Map<string,Swing>();
  private rigs:ToolAnimationRig[]=[];
  private queued = new Map<string,Array<{event:ActionFx;season:Season;start:number}>>();
  private waterUntil=new Map<string,number>();
  private crackViews=new Map<string,Phaser.GameObjects.Graphics>();
  private rockUntil=new Map<string,Array<{end:number;hp:number}>>();
  private shakes = new Map<string,{start:number;duration:number;dir:number;tree:boolean;failed:boolean;stage:number}>();
  private ghosts:Ghost[]=[];
  private particles:Particle[]=[];
  private pool:Phaser.GameObjects.Image[]=[];
  private born=new Map<string,DropMotion>();
  private picked=new Set<string>();
  private hidden=new Map<string,number>();
  private attractions:Attraction[]=[];
  private graphics:Phaser.GameObjects.Graphics;
  private lastArea="";
  constructor(private scene:Phaser.Scene,private sound:(sound:Sound)=>void,private view:(id:string)=>View|undefined) {
    this.graphics=scene.add.graphics().setDepth(15000);
  }
  private visible(x:number,y:number,margin=100):boolean {
    const r=this.scene.cameras.main.worldView;
    return x>=r.x-margin && x<=r.right+margin && y>=r.y-margin && y<=r.bottom+margin;
  }
  event(event:ActionFx,area:string,season:Season):void {
    if(this.seen.has(event.id))return;
    this.seen.add(event.id);if(this.seen.size>256)this.seen.delete(this.seen.values().next().value!);
    if(event.area!==area)return;
    const now=this.scene.time.now;
    const target=event.target;
    if(event.outcome==="pickup" && target) {
      this.picked.add(target.id);
      if(this.picked.size>256)this.picked.delete(this.picked.values().next().value!);
      const v=this.view(target.id),motion=this.born.get(target.id);
      const x=v?.body.x??target.x+(motion?.dx??0),y=v?.body.y??target.y-7;
      v?.body.setVisible(false);v?.label.setVisible(false);motion?.shadow?.setVisible(false);
      if(!this.visible(x,y)||this.attractions.length>=16)return;
      const sprite=this.scene.add.sprite(x,y,`drop-icon-${target.item}`).setDisplaySize(24,24).setDepth(target.y+80);
      const shadow=this.scene.add.ellipse(target.x,target.y,15,5,0x293b2a,.18).setDepth(target.y-.1);
      this.attractions.push({sprite,shadow,event,start:now,x,y});
      return;
    }
    const active=this.swings.get(event.actorId);
    if(active) {
      const queue=this.queued.get(event.actorId)??[];
      // Bounded queue keeps rapid/replayed network actions from cutting off an
      // unplayed impact. Normal input starts a new action after recovery.
      if(queue.length<4){
        const previous=queue.at(-1),start=Math.max(now,previous?previous.start+actionTiming(previous.event).duration:active.start+actionTiming(active.event).duration);
        this.prepare(event,season,start);queue.push({event,season,start});this.queued.set(event.actorId,queue);
      }
      return;
    }
    this.begin(event,season,now);
  }
  private begin(event:ActionFx,season:Season,now:number,prepared=false):void {
    if(!prepared)this.prepare(event,season,now);
    if(!this.visible(event.x,event.y,250)||this.swings.size>=20)return;
    const rig=this.rigs.pop()??new ToolAnimationRig(this.scene);rig.start(event);
    this.swings.set(event.actorId,{event,start:now,impacted:false,rig,whooshed:false});
  }
  private prepare(event:ActionFx,season:Season,now:number):void {
    const target=event.target;
    event.drops.forEach((d,i)=>{
      const angle=i*2.399963+Number(d.id.slice(5))*.73;
      this.born.set(d.id,{start:now+dropAppearDelay(event),dx:Math.cos(angle)*(12+i%3*4),dy:Math.sin(angle)*8});
    });
    if(!this.visible(target?.x??event.x,target?.y??event.y,300))return;
    if(event.action==="tillTile" && event.point)
      this.hidden.set(`soil-${event.area}-${Math.floor(event.point.x/TILE)}-${Math.floor(event.point.y/TILE)}`,now+impactDelay(event));
    if(event.action==="waterCrop" && event.point)
      this.waterUntil.set(`soil-${event.area}-${Math.floor(event.point.x/TILE)}-${Math.floor(event.point.y/TILE)}`,now+impactDelay(event));
    if(target?.kind==="rock" && event.outcome!=="fail") {
      const pending=this.rockUntil.get(target.id)??[];
      pending.push({end:now+impactDelay(event),hp:event.hpBefore??event.maxHp??3});
      pending.sort((a,b)=>a.end-b.end);this.rockUntil.set(target.id,pending);
    }
    if(event.outcome==="break" && target && this.ghosts.length<16) {
      const asset=target.kind==="tree" ? treeSprite(target.species||inferSpecies(target.asset,target.id),target.stage,season) : target.asset;
      if(!this.scene.textures.exists(asset))return;
      const v=this.view(target.id);
      const size=visualSize(ASSETS[asset],target.kind==="tree" ? treeSeasonScale(target.species||inferSpecies(target.asset,target.id),target.stage,season) : undefined);
      const width=v?.body.texture.key===asset ? v.body.displayWidth : size.width;
      const height=v?.body.texture.key===asset ? v.body.displayHeight : size.height;
      const a=ASSETS[asset],sprites:Phaser.GameObjects.Sprite[]=[];
      for(let i=0;i<(target.kind==="rock"?2:1);i++) {
        const sprite=this.scene.add.sprite(target.x,target.y,asset).setOrigin(a?.origin?.x??.5,a?.origin?.y??.85)
          .setDisplaySize(width,height).setDepth(target.y+2);
        if(target.kind==="rock")sprite.setCrop(i*sprite.width/2,0,sprite.width/2,sprite.height);
        sprites.push(sprite);
      }
      const duration=breakDuration(target);
      this.ghosts.push({sprites,scales:sprites.map(s=>({x:s.scaleX,y:s.scaleY})),event,start:now+impactDelay(event),duration,impact:false});
      this.hidden.set(target.id,now+impactDelay(event)+duration);
    }
  }
  hiddenObject(id:string,now:number):boolean {return (this.hidden.get(id)??0)>now;}
  private emit(x:number,y:number,color:number,count:number,now:number,direction=0):void {
    if(!this.visible(x,y))return;
    for(let i=0;i<count && this.particles.length<80;i++) {
      const sprite=this.pool.pop()??this.scene.add.image(0,0,"__WHITE");
      sprite.setVisible(true).setAlpha(1).setTint(color).setDisplaySize(i%3===0?5:3,i%2===0?2:3).setDepth(y+30);
      const angle=(i+.3)*2.39996;
      this.particles.push({sprite,start:now,life:280+i%4*85,x,y,vx:Math.cos(angle)*(20+i%5*12)+direction*20,vy:-25-i%4*22,color});
    }
  }
  drop(id:string,v:View,x:number,y:number,now:number):void {
    let m=this.born.get(id);
    if(!m) {m={start:-Infinity,dx:Math.sin(x+y)*5,dy:0};this.born.set(id,m);}
    const hidden=this.picked.has(id)||now<m.start;
    v.body.setVisible(!hidden);v.label.setVisible(!hidden);
    if(!m.shadow)m.shadow=this.scene.add.ellipse(x,y,16,5,0x293b2a,.2).setDepth(y-.5);
    m.shadow.setVisible(!hidden);
    if(hidden)return;
    const t=(now-m.start)/DROP_SETTLE_MS;
    const scatter=Math.min(1,Math.max(0,t*1.8));
    const px=x+m.dx*scatter,py=y+m.dy*scatter;
    const h=t<.7 ? 29*Math.sin(Math.PI*t/.7) : t<1 ? 7*Math.sin(Math.PI*(t-.7)/.3) : 0;
    const bob=t>=1 ? Math.sin(now/430+x+y)*1.5 : 0;
    v.body.setPosition(px,py-8-h+bob).setAngle(t<1?m.dx*Math.sin(t*Math.PI)*.6:0);
    v.label.setPosition(px+10,py+5-h+bob).setDepth(y+3);
    m.shadow.setPosition(px,py+3).setScale(1-h/65).setAlpha(.2-h/230);
  }
  forgetDrop(id:string):void {this.born.get(id)?.shadow?.destroy();this.born.delete(id);}
  watered(id:string,value:boolean,now:number):boolean {return value && (this.waterUntil.get(id)??0)<=now;}
  busy(id:string):boolean {return this.swings.has(id);}
  acting(id:string,now:number):{facing:string;blend:number}|undefined {
    const s=this.swings.get(id);if(!s)return;
    const duration=actionTiming(s.event).duration,elapsed=now-s.start;
    if(elapsed>duration)return;
    return {facing:s.event.facing,blend:Math.min(1,elapsed/55,(duration-elapsed)/100)};
  }
  /** Only visible ore views invoke this, and geometry changes only with HP. */
  rockDamage(id:string,v:View,hp:number,max:number):void {
    const pending=this.rockUntil.get(id)?.find(p=>p.end>this.scene.time.now);
    if(pending)hp=pending.hp;
    let g=this.crackViews.get(id);
    if(hp>=max || max<3 || !v.body.visible){g?.setVisible(false);return;}
    if(!g){g=this.scene.add.graphics();this.crackViews.set(id,g);}
    const damage=max-hp;
    if(g.getData("damage")!==damage) {
      g.clear().setData("damage",damage).lineStyle(1.2,0x394139,.85);
      const h=Math.min(24,v.body.displayHeight*.55);
      g.beginPath();g.moveTo(-2,-h);g.lineTo(3,-h*.7);g.lineTo(-2,-h*.4);g.lineTo(1,-3);g.strokePath();
      if(damage>=2){g.lineBetween(3,-h*.7,9,-h*.6);g.lineBetween(-2,-h*.4,-9,-h*.35);}
    }
    g.setPosition(v.body.x,v.body.y).setDepth(v.body.depth+.2).setVisible(true);
  }
  forgetObject(id:string):void {this.crackViews.get(id)?.destroy();this.crackViews.delete(id);}
  update(now:number,players:RenderPlayer[],area:string):void {
    if(this.lastArea && this.lastArea!==area)this.clear();
    this.lastArea=area;
    const g=this.graphics;g.clear();
    for(const [id,s] of this.swings) {
      const elapsed=now-s.start,e=s.event,p=players.find(p=>p.id===id),timing=actionTiming(e);
      if(!p || p.area!==area || !this.visible(p.x,p.y,200)) {
        s.rig.hide();this.rigs.push(s.rig);this.swings.delete(id);this.queued.delete(id);continue;
      }
      s.rig.update(elapsed,p.x,p.y);
      if(!s.whooshed && elapsed>=timing.windup && e.tool!=="hand" && e.tool!=="water") {
        s.whooshed=true;this.sound(e.tool==="scythe"?"swish":"swing");
      }
      if(!s.impacted&&elapsed>=timing.impact) {
        s.impacted=true;
        const target=e.target,tx=s.rig.contact.x,ty=s.rig.contact.y;
        const dx=e.facing==="left"?-1:e.facing==="right"?1:0,dy=e.facing==="up"?-1:e.facing==="down"?1:0;
        const failed=e.outcome==="fail",tree=target?.kind==="tree",rock=target?.kind==="rock",flower=target&&naturalFlower(target);
        if(target || !failed) {
          this.sound(failed?"clunk":e.tool==="water"?"water":e.tool==="scythe"?"cut":rock?(e.maxHp===3?"ore":"stone"):e.tool==="hoe"?"soil":e.tool==="hand"?"harvest":flower?"soil":tree&&target.stage>=3?"heavyWood":"wood");
          if(e.tool!=="water")this.emit(tx,ty,failed?0xc3b398:flower?0xefb4d2:rock?0xc4cec1:e.tool==="scythe"?0x8caf58:0xd1a674,failed?3:rock?5+(e.maxHp??1)-(e.hpAfter??0):tree?7:6,now,dx||dy);
          if(target&&e.outcome!=="break")this.shakes.set(target.id,{start:now,duration:tree?430+target.stage*35:210,dir:dx||1,tree,failed,stage:target.stage});
        } else this.sound("swing");
      }
      if(e.tool==="hoe" && e.outcome!=="fail" && elapsed>=timing.impact && elapsed<timing.follow) {
        const t=(elapsed-timing.impact)/(timing.follow-timing.impact),point=e.point??s.rig.contact;
        g.lineStyle(1.5,0x765236,(1-t)*.7);
        for(let i=-1;i<=1;i++)g.lineBetween(point.x-9,point.y+i*5,point.x-9+18*Math.min(1,t*3),point.y+i*5+1);
      }
      if(elapsed>=timing.duration) {
        s.rig.hide();this.rigs.push(s.rig);this.swings.delete(id);
        const queue=this.queued.get(id),next=queue?.shift();
        if(!queue?.length)this.queued.delete(id);
        if(next)this.begin(next.event,next.season,next.start,true);
      }
    }
    for(const [id,s] of this.shakes) {
      const t=(now-s.start)/s.duration,v=this.view(id);
      if(t>=1){this.shakes.delete(id);continue;}
      if(!v||!this.visible(v.x,v.y,220))continue;
      const wave=Math.sin(t*Math.PI*4)*(1-t)*(s.failed ? .35 : 1)*s.dir;
      if(s.tree)v.body.angle+=wave*(s.stage>=3?1.6:3);
      else v.body.x+=wave*2.5;
    }
    this.ghosts=this.ghosts.filter(f=>{
      const t=Math.max(0,(now-f.start)/f.duration),e=f.event,target=e.target!,dir=e.facing==="left"?-1:1;
      if(t>=1){for(const s of f.sprites)s.destroy();return false;}
      for(let i=0;i<f.sprites.length;i++) {
        const s=f.sprites[i]!;
        if(target.kind==="tree") {
          s.setAngle(dir*(t<.16?-Math.sin(t/.16*Math.PI)*3:Math.pow((t-.16)/.84,2)*83));
          s.setAlpha(t>.82?(1-t)/.18:1);
        } else if(target.kind==="rock") {
          const side=i?-1:1;s.setPosition(target.x+side*t*15,target.y-Math.sin(t*Math.PI)*10+t*t*9).setAngle(side*t*27).setAlpha(1-t*t);
          if(now>=f.start){g.lineStyle(1.6,0x35483e,1-t);g.beginPath();g.moveTo(target.x-2,target.y-s.displayHeight*.65);g.lineTo(target.x+3,target.y-12);g.lineTo(target.x-4,target.y);g.strokePath();}
        } else {
          const hand=e.tool==="hand",dx=e.facing==="left"?-1:e.facing==="right"?1:0,dy=e.facing==="up"?-1:e.facing==="down"?1:0;
          s.setPosition(hand?target.x+(e.x-target.x)*t*.5:target.x+dx*t*9,hand?target.y+(e.y-20-target.y)*t:target.y+dy*t*6-Math.sin(t*Math.PI)*5)
            .setAngle(dir*t*(hand?8:32)).setAlpha(1-t).setScale(f.scales[i]!.x,f.scales[i]!.y*(1-t*(hand?.2:.5)));
        }
      }
      if(t>.82&&!f.impact) {
        f.impact=true;
        this.emit(target.x+(target.kind==="tree"?dir*25:0),target.y,target.kind==="tree"?0xa3bc72:target.kind==="rock"?0x95a39a:0x88ac55,10,now,dir);
        if(target.kind==="tree"||target.kind==="rock")this.sound(target.kind==="tree"?(target.stage>=3?"heavyFall":"fall"):"breakStone");
      }
      return true;
    });
    this.attractions=this.attractions.filter(a=>{
      const t=Math.min(1,(now-a.start)/300),p=players.find(p=>p.id===a.event.actorId),ease=t*t;
      const x=p?.x??a.event.x,y=(p?.y??a.event.y)-20;
      a.sprite.setPosition(a.x+(x-a.x)*ease,a.y+(y-a.y)*ease-Math.sin(t*Math.PI)*6).setScale(.6*(1-t*.65)).setAlpha(1-t*.4);
      a.shadow.setAlpha(.18*(1-t));
      if(t>=1){a.sprite.destroy();a.shadow.destroy();this.emit(x,y,0xf4dda0,4,now);this.sound("pickup");return false;}return true;
    });
    this.particles=this.particles.filter(p=>{
      const t=(now-p.start)/1000,f=t/(p.life/1000);
      if(f>=1){p.sprite.setVisible(false);this.pool.push(p.sprite);return false;}
      p.sprite.setPosition(p.x+p.vx*t,p.y+p.vy*t+110*t*t).setAlpha((1-f)*.9).setRotation(t*5);return true;
    });
    for(const [id,end] of this.hidden)if(end<=now)this.hidden.delete(id);
    for(const [id,end] of this.waterUntil)if(end<=now)this.waterUntil.delete(id);
    for(const [id,values] of this.rockUntil) {
      while(values[0] && values[0].end<=now)values.shift();
      if(!values.length)this.rockUntil.delete(id);
    }
    // Culling can remove a drop before its event arrives; expire unused metadata.
    for(const [id,m] of this.born)if(!this.view(id)&&now-m.start>5000)this.forgetDrop(id);
  }
  clear():void {
    for(const s of this.swings.values()){s.rig.hide();this.rigs.push(s.rig);}this.swings.clear();this.shakes.clear();this.queued.clear();this.waterUntil.clear();
    for(const id of this.crackViews.keys())this.forgetObject(id);this.rockUntil.clear();
    for(const f of this.ghosts)for(const s of f.sprites)s.destroy();this.ghosts=[];
    for(const a of this.attractions){a.sprite.destroy();a.shadow.destroy();}this.attractions=[];
    for(const p of this.particles){p.sprite.setVisible(false);this.pool.push(p.sprite);}this.particles=[];
    for(const id of this.born.keys())this.forgetDrop(id);this.picked.clear();this.hidden.clear();this.graphics.clear();
  }
  destroy():void {this.clear();for(const rig of this.rigs)rig.destroy();this.rigs=[];for(const s of this.pool)s.destroy();this.pool=[];this.graphics.destroy();}
}
