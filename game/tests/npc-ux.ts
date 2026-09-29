import {strict as assert} from "node:assert";
import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {NpcDialogue} from "../../app/components/NpcDialogue";
import {VillageJournal} from "../../app/components/VillageJournal";
import {NpcQuests} from "../../app/components/NpcQuests";
import {NpcRenderer,createNpcAssets,preloadNpcs} from "../npc/NpcRenderer";
import {NPC_DEFINITIONS,validateNpcs} from "../npc/definitions";
import {npcLineClear} from "../npc/navigation";
import {nearestNpc} from "../npc/dialogue";
import {MapRegistry} from "../maps/MapRegistry";
import {questViews} from "../quests/engine";
import {QUEST_DEFINITIONS} from "../quests/definitions";
import {normalizeProgress} from "../npc/progress";
import {Inventory} from "../domain";
import {ITEM_DEFINITIONS} from "../data/items";
import {initialHud} from "../events";
const maps=new MapRegistry(),map=maps.require("general_store");
assert.equal(npcLineClear(map,{x:280,y:80},{x:280,y:200}),false);
assert.equal(npcLineClear(map,{x:144,y:200},{x:144,y:230}),true);
assert.equal(nearestNpc([{npcId:"daon",mapId:map.id,x:280,y:160,facing:"down",moving:false,activity:""}],{mapId:map.id,x:280,y:96},map),undefined);
assert.ok(validateNpcs([...NPC_DEFINITIONS,NPC_DEFINITIONS[0]],maps).length);
assert.ok(validateNpcs([{...NPC_DEFINITIONS[0],asset:{...NPC_DEFINITIONS[0].asset,frameSize:{width:0,height:0}}}],maps).length);
assert.equal(new Set(QUEST_DEFINITIONS.map(q=>q.id)).size,QUEST_DEFINITIONS.length);
for(const q of QUEST_DEFINITIONS){assert.ok(NPC_DEFINITIONS.some(n=>n.id===q.giver));assert.ok(q.reward.money>=0&&q.reward.friendship>=0);for(const id of Object.keys(q.reward.items))assert.ok(id in ITEM_DEFINITIONS);for(const id of q.requires)assert.ok(QUEST_DEFINITIONS.some(p=>p.id===id&&p.id!==q.id));}
for(const npc of NPC_DEFINITIONS)for(const id of [...npc.giftPreferences.loved,...npc.giftPreferences.neutral,...npc.giftPreferences.disliked])assert.ok(id in ITEM_DEFINITIONS);
const progress=normalizeProgress(null),quests=questViews(progress,new Inventory());
let destroyed=0;const labels:string[]=[],animations:string[]=[];
const node=()=>{const proxy:any=new Proxy({}, {get:(_t,key)=>(...args:any[])=>{if(key==="setText")labels.push(args[0]);if(key==="play")animations.push(args[0]);if(key==="destroy")destroyed++;return proxy;}});return proxy;};
const renderer=new NpcRenderer({add:{sprite:node,text:node}} as never);
const pose={npcId:"boram",mapId:"farm",x:240,y:400,facing:"down" as const,moving:true,activity:"산책"};
renderer.update([pose],"farm",{mapId:"farm",x:240,y:390},quests,maps.require("farm"));
assert.ok(labels.some(l=>l.includes("! 보람")&&l.includes("대화")));assert.ok(animations.includes("npc-boram-walk-down"));
renderer.update([{...pose,moving:false}],"farm",undefined,quests.map(q=>({...q,status:"completed"})));assert.ok(labels.some(l=>l.includes("★")));assert.ok(animations.includes("npc-boram-idle-down"));
renderer.update([pose],"town");assert.equal(destroyed,2);renderer.destroy();
// Exercise actual asset setup for loaded, absent and truncated sheets, without browser graphics.
for(const frameCount of [32,0,10]){
 const made:any[]=[],loads:string[]=[];let fallbacks=0;
 const graphic:any=new Proxy({}, {get:(_t,key)=>(..._args:any[])=>{if(key==="generateTexture")fallbacks++;return graphic;}});
 const scene:any={load:{spritesheet:(key:string)=>loads.push(key)},textures:{exists:()=>frameCount>0,get:()=>({has:(n:string)=>Number(n)<frameCount}),remove:()=>{}},add:{graphics:()=>graphic},anims:{exists:()=>false,generateFrameNumbers:(key:string,range:any)=>Array.from({length:range.end-range.start+1},(_,i)=>({key,frame:i+range.start})),create:(a:any)=>made.push(a)}};
 preloadNpcs(scene);createNpcAssets(scene);assert.equal(loads.length,3);assert.equal(made.length,24);assert.equal(fallbacks,frameCount===32?0:3);assert.ok(made.every(a=>a.frames.length===(frameCount===32?4:1)));
}
const markup=renderToStaticMarkup(createElement(NpcDialogue,{dialogue:{npcId:"daon",name:"다온",image:"/assets/npc/daon.png",lines:["안녕","반가워"],index:0},onNext:()=>{},onClose:()=>{}}));
for(const text of ["다온","안녕","다음","닫기","role=\"dialog\""])assert.ok(markup.includes(text));
const journal=renderToStaticMarkup(createElement(VillageJournal,{hud:{...initialHud,quests,villagers:[{id:"daon",name:"다온",points:0,level:"처음 보는 사이",location:"햇살마을",activity:"산책"}]},onClose:()=>{}}));
assert.ok(journal.includes("햇살마을"));assert.ok(journal.includes("우리 마을에 인사해요"));
const questUI=renderToStaticMarkup(createElement(NpcQuests,{quests,busy:true,onAction:()=>{}}));assert.ok(questUI.includes("disabled"));
console.log("Village UX: labels, quest markers, same-map animations, fallback, wall interaction and accessible dialogue/journal passed");
