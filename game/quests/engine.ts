import { QUEST_DEFINITIONS,getQuest,type QuestStatus } from "./definitions";
import { RELATIONSHIP_RULES, type PlayerProgress } from "../npc/progress";
import type { ItemId } from "../data/items";
export interface QuestRecord {status:QuestStatus;talked:string[]}
export interface QuestView {id:string;name:string;giver:string;description:string;status:QuestStatus;detail:string;canDeliver:boolean;reward:string}
export interface QuestInventory {count:(id:ItemId)=>number;consume:(id:ItemId,amount:number)=>boolean;add:(id:ItemId,amount:number)=>void}
export type QuestAction={kind:"quest-start"|"quest-deliver"|"quest-reward";questId:string};
export function questViews(progress:PlayerProgress,inventory:QuestInventory):QuestView[]{
 return QUEST_DEFINITIONS.map(q=>{
  const record=progress.quests[q.id];const status:QuestStatus=record?.status??(q.requires.every(id=>progress.quests[id]?.status==="rewarded")?"available":"locked");
  const o=q.objective,amount=o.kind==="greet"?(record?.talked.filter(id=>o.npcIds.includes(id)).length??0):inventory.count(o.itemId),target=o.kind==="greet"?o.npcIds.length:o.amount;
  return {id:q.id,name:q.name,giver:q.giver,description:q.description,status,detail:`${Math.min(amount,target)}/${target}`,canDeliver:status==="active"&&o.kind==="deliver"&&amount>=target,reward:`${q.reward.money}G · 씨앗 ${Object.values(q.reward.items).reduce((a,b)=>a+b,0)}개 · 호감도 +${q.reward.friendship}`};
 });
}
export function recordNpcGreeting(progress:PlayerProgress,npcId:string){
 for(const q of QUEST_DEFINITIONS){const p=progress.quests[q.id];if(p?.status!=="active"||q.objective.kind!=="greet")continue;
  if(q.objective.npcIds.includes(npcId)&&!p.talked.includes(npcId))p.talked.push(npcId);
  if(q.objective.npcIds.every(id=>p.talked.includes(id)))p.status="completed";
 }
}
export function applyQuestAction(progress:PlayerProgress,inventory:QuestInventory,money:number,action:QuestAction):number {
 const q=getQuest(action.questId);if(!q)throw new Error("없는 의뢰입니다.");
 const view=questViews(progress,inventory).find(v=>v.id===q.id)!;
 if(action.kind==="quest-start"){
  if(view.status!=="available")throw new Error("지금 받을 수 없는 의뢰입니다.");
  progress.quests[q.id]={status:"active",talked:[]};return money;
 }
 const record=progress.quests[q.id];
 if(action.kind==="quest-deliver"){
  if(!view.canDeliver||q.objective.kind!=="deliver")throw new Error("전달할 수확물이 부족하거나 진행 중인 의뢰가 아닙니다.");
  if(!inventory.consume(q.objective.itemId,q.objective.amount))throw new Error("수확물이 부족합니다.");
  record.status="completed";return money;
 }
 if(action.kind!=="quest-reward"||view.status!=="completed")throw new Error("아직 받을 수 없는 보상입니다.");
 record.status="rewarded";
 for(const [id,amount] of Object.entries(q.reward.items))inventory.add(id as ItemId,amount);
 const rel=progress.relationships[q.giver];rel.points=Math.min(RELATIONSHIP_RULES.maxPoints,rel.points+q.reward.friendship);
 return money+q.reward.money;
}
