import { QUEST_DEFINITIONS, type QuestStatus } from "../quests/definitions";
import type { QuestRecord, QuestAction } from "../quests/engine";
import { NPC_DEFINITIONS, getNpc } from "./definitions";
import { selectDialogue, type DialogueMemory, type DialogueView } from "./dialogue";
import type { ItemId } from "../data/items";
import type { RelationshipEventRunView } from "../relationship-events/types";
import { getRelationshipEvent } from "../relationship-events/definitions";
export const RELATIONSHIP_RULES={dailyTalkPoints:10,maxPoints:1000,levels:[{points:0,name:"처음 보는 사이"},{points:20,name:"아는 사이"},{points:80,name:"친한 사이"},{points:200,name:"좋은 친구"}]} as const;
export interface NpcRelationship { points:number; lastTalkDay:number|null; lastGiftDaySerial:number|null; dialogue:DialogueMemory }
export interface PlayerProgress { version:1; quests:Record<string,QuestRecord>; relationships:Record<string,NpcRelationship>; seenEventIds:string[]; activeEventId:string|null }
export interface ProgressSnapshot { revision:number; data:PlayerProgress }
export type ProgressAction = {kind:"talk";npcId:string} | {kind:"gift";npcId:string;itemId:ItemId} | {kind:"event-start";eventId:string} | {kind:"event-complete";eventId:string} | QuestAction;
export interface ProgressResult { progress:ProgressSnapshot; dialogue?:DialogueView; event?:RelationshipEventRunView; notice?:string; snapshot?:import("../family/types").FamilySnapshot }
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==="object"&&!Array.isArray(v);
export function normalizeProgress(value:unknown):PlayerProgress {
 const raw=record(value)&&record(value.relationships)?value.relationships:{};
 const relationships:Record<string,NpcRelationship>={};
 for(const n of NPC_DEFINITIONS){const entry=raw[n.id];const v=record(entry)?entry:{};const d=record(v.dialogue)?v.dialogue:{};
  relationships[n.id]={points:typeof v.points==="number"&&Number.isFinite(v.points)?Math.min(RELATIONSHIP_RULES.maxPoints,Math.max(0,Math.floor(v.points))):0,
   lastTalkDay:typeof v.lastTalkDay==="number"&&Number.isSafeInteger(v.lastTalkDay)&&v.lastTalkDay>0?v.lastTalkDay:null,
   lastGiftDaySerial:typeof v.lastGiftDaySerial==="number"&&Number.isSafeInteger(v.lastGiftDaySerial)&&v.lastGiftDaySerial>0?v.lastGiftDaySerial:null,
   dialogue:{met:d.met===true,cursor:typeof d.cursor==="number"&&Number.isSafeInteger(d.cursor)&&d.cursor>=0?d.cursor:0,lastKey:typeof d.lastKey==="string"?d.lastKey.slice(0,80):undefined}};
 }
 const quests:Record<string,QuestRecord>={};const rawQuests=record(value)&&record(value.quests)?value.quests:{};
 for(const q of QUEST_DEFINITIONS){const v=rawQuests[q.id];if(!record(v)||!["active","completed","rewarded"].includes(String(v.status)))continue;
  quests[q.id]={status:v.status as QuestStatus,talked:Array.isArray(v.talked)?[...new Set(v.talked.filter((id):id is string=>typeof id==="string"&&!!getNpc(id)))]:[]};
 }
 const seenEventIds=record(value)&&Array.isArray(value.seenEventIds)?[...new Set(value.seenEventIds.filter((id):id is string=>typeof id==="string"&&!!getRelationshipEvent(id)))]:[];
 const activeEventId=record(value)&&typeof value.activeEventId==="string"&&getRelationshipEvent(value.activeEventId)&&!seenEventIds.includes(value.activeEventId)?value.activeEventId:null;
 return {version:1,relationships,quests,seenEventIds,activeEventId};
}
export const relationshipLevel=(points:number)=>RELATIONSHIP_RULES.levels.findLast(l=>points>=l.points)!.name;
export function talkToNpc(progress:PlayerProgress,npcId:string,day:number,minute:number,daySerial:number):DialogueView {
 const npc=getNpc(npcId);if(!npc)throw new Error("없는 주민입니다.");
 const rel=progress.relationships[npcId];const selected=selectDialogue(npc,day,minute,rel.dialogue,rel.points);rel.dialogue=selected.memory;
 if(rel.lastTalkDay!==daySerial){rel.points=Math.min(RELATIONSHIP_RULES.maxPoints,rel.points+RELATIONSHIP_RULES.dailyTalkPoints);rel.lastTalkDay=daySerial;}
 return {npcId,name:npc.name,image:npc.asset.source?.path??"",lines:selected.lines,index:0,relationship:`${relationshipLevel(rel.points)} · 호감도 ${rel.points}`};
}
