import type { MapDefinition } from "../maps/types";
import { npcLineClear } from "./navigation";
import type { NpcDefinition, NpcPose } from "./types";
export interface DialogueMemory { met:boolean; cursor:number; lastKey?:string }
export interface DialogueView { npcId:string; name:string; image:string; lines:string[]; index:number; relationship?:string; notice?:string; eventId?:string; eventTitle?:string }
export function selectDialogue(npc:NpcDefinition, day:number, minute:number, memory:DialogueMemory, relationshipPoints=0) {
  if(!memory.met) return {lines:npc.dialogue.first,memory:{met:true,cursor:0,lastKey:"first"}};
  const period=minute<720?"morning":minute<1080?"afternoon":"evening";
  const choices=[...npc.dialogue[period].map((lines,i)=>({key:`${period}-${i}`,lines})),...npc.dialogue.general.map((lines,i)=>({key:`general-${i}`,lines})),...npc.dialogue.progress.filter(p=>day>=p.minDay).map((p,i)=>({key:`progress-${i}`,lines:p.lines})),...(npc.dialogue.relationship??[]).filter(p=>relationshipPoints>=p.minPoints).map((p,i)=>({key:`relationship-${i}`,lines:p.lines}))];
  let index=memory.cursor%choices.length;
  if(choices[index].key===memory.lastKey && choices.length>1)index=(index+1)%choices.length;
  const choice=choices[index];
  return {lines:choice.lines,memory:{met:true,cursor:index+1,lastKey:choice.key}};
}
export const NPC_TALK_DISTANCE=64;
export function nearestNpc(poses:NpcPose[], player:{mapId:string;x:number;y:number},map?:MapDefinition) {
  return poses.filter(p=>p.mapId===player.mapId&&Math.hypot(p.x-player.x,p.y-player.y)<=NPC_TALK_DISTANCE&&(!map||npcLineClear(map,player,p)))
    .sort((a,b)=>Math.hypot(a.x-player.x,a.y-player.y)-Math.hypot(b.x-player.x,b.y-player.y)||a.npcId.localeCompare(b.npcId))[0];
}
