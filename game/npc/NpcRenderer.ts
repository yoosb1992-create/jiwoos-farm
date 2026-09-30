import { nearestNpc } from "./dialogue";
import type { QuestView } from "../quests/engine";
import type { MapDefinition } from "../maps/types";
import type * as Phaser from "phaser";
import { WORLD_OVERLAY_DEPTH, depthFromGroundAnchor } from "../assets/definitions";
import { NPC_DEFINITIONS } from "./definitions";
import type { NpcPose } from "./types";
const directions=["down","up","left","right"] as const;
export function preloadNpcs(scene:Phaser.Scene) {
  for(const n of NPC_DEFINITIONS) { const s=n.asset.source; if(s?.kind==="spritesheet") scene.load.spritesheet(n.asset.textureKey,s.path,{frameWidth:s.frameWidth,frameHeight:s.frameHeight}); }
}
export function createNpcAssets(scene:Phaser.Scene) {
  for(const n of NPC_DEFINITIONS) {
    const key=n.asset.textureKey;
    const valid=scene.textures.exists(key)&&Array.from({length:32},(_,i)=>i).every(i=>scene.textures.get(key).has(String(i)));
    if(!valid) {
      if(scene.textures.exists(key)) scene.textures.remove(key);
      const g=scene.add.graphics(); g.fillStyle(n.fallbackColor).fillRect(9,16,14,15).fillStyle(0xe9b78f).fillCircle(16,10,8).generateTexture(key,32,36).destroy();
    }
    for(const [row,facing] of directions.entries()) for(const mode of ["idle","walk"]) {
      const animation=`${key}-${mode}-${facing}`,start=row*8+(mode==="walk"?4:0);
      if(scene.anims.exists(animation)) scene.anims.remove(animation);
      scene.anims.create({key:animation,frames:valid?scene.anims.generateFrameNumbers(key,{start,end:start+3}):[{key}],frameRate:mode==="walk"?8:2,repeat:-1});
    }
  }
}
export class NpcRenderer {
  private labels=new Map<string,Phaser.GameObjects.Text>();
  private views=new Map<string,Phaser.GameObjects.Sprite>();
  constructor(private scene:Phaser.Scene) {}
  update(poses:NpcPose[],mapId:string,player?:{mapId:string;x:number;y:number},quests:QuestView[]=[],map?:MapDefinition) {
    const nearby=player?nearestNpc(poses,player,map)?.npcId:undefined;
    const visible=poses.filter(p=>p.mapId===mapId);
    for(const [id,view] of this.views) if(!visible.some(p=>p.npcId===id)){view.destroy();this.views.delete(id);this.labels.get(id)?.destroy();this.labels.delete(id);}
    for(const p of visible) {
      const n=NPC_DEFINITIONS.find(n=>n.id===p.npcId)!; let view=this.views.get(n.id);
      if(!view){view=this.scene.add.sprite(p.x,p.y,n.asset.textureKey).setOrigin(n.asset.origin.x,n.asset.origin.y).setScale(n.asset.displayScale.x,n.asset.displayScale.y);this.views.set(n.id,view);this.labels.set(n.id,this.scene.add.text(p.x,p.y-24,n.name,{fontFamily:"sans-serif",fontSize:"12px",color:"#fff8d8",backgroundColor:"#354535dd",padding:{x:4,y:2}}).setOrigin(.5,1).setDepth(WORLD_OVERLAY_DEPTH+.3));}
      const ownQuests=quests.filter(q=>q.giver===n.id),ready=ownQuests.some(q=>q.status==="completed"||q.canDeliver),available=ownQuests.some(q=>q.status==="available");
      this.labels.get(n.id)!.setPosition(p.x,p.y-23).setText(`${ready?"★ ":available?"! ":""}${n.name}${nearby===n.id?" · 대화 ⋯":""}`);
      view.setPosition(p.x,p.y).setDepth(depthFromGroundAnchor(
        p,
        n.asset,
        { width:view.displayWidth, height:view.displayHeight },
      )).play(`${n.asset.textureKey}-${p.moving?"walk":"idle"}-${p.facing}`,true);
    }
  }
  destroy(){for(const v of this.views.values())v.destroy();this.views.clear();for(const l of this.labels.values())l.destroy();this.labels.clear();}
}
