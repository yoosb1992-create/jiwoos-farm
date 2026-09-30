import { npcLineClear } from "../../game/npc/navigation";
import { MAP_DEFINITIONS } from "../../game/maps/definitions";
import { Inventory, type InventoryData } from "../../game/domain";
import { getQuest } from "../../game/quests/definitions";
import { applyQuestAction, recordNpcGreeting } from "../../game/quests/engine";
import { FamilyRooms, FamilyError, type FamilyDB } from "./rooms";
import { FamilyState } from "./state";
import { normalizeProgress, talkToNpc, type ProgressSnapshot, type ProgressAction, type ProgressResult } from "../../game/npc/progress";
import { NpcController } from "../../game/npc/NpcController";
import { NPC_DEFINITIONS, getNpc } from "../../game/npc/definitions";
import { MapRegistry } from "../../game/maps/MapRegistry";
import type { MapDefinition } from "../../game/maps/types";
import { parseFamilyPose } from "../../game/family/personal";
import { ITEM_DEFINITIONS, type ItemId } from "../../game/data/items";
import { giftToNpc } from "../../game/npc/gifts";
import { getRelationshipEvent } from "../../game/relationship-events/definitions";
import { completeRelationshipEvent, startRelationshipEvent } from "../../game/relationship-events/system";
import { weatherFor } from "../../game/weather/system";
export class FamilyProgress extends FamilyRooms {
 private readonly npcs:NpcController;
 constructor(db:FamilyDB,now=()=>Date.now(),private readonly maps:Record<string,MapDefinition>=MAP_DEFINITIONS){
  super(db,now);this.npcs=new NpcController(NPC_DEFINITIONS,new MapRegistry(maps));
 }
 private async progressRow(playerId:string):Promise<ProgressSnapshot>{
  await this.db.prepare("INSERT OR IGNORE INTO family_player_progress (player_id,revision,progress_json,updated_at) VALUES (?,0,?,?)").bind(playerId,JSON.stringify(normalizeProgress(null)),this.now()).run();
  const row=await this.db.prepare("SELECT revision, progress_json FROM family_player_progress WHERE player_id=?").bind(playerId).first<{revision:number;progress_json:string}>();
  if(!row)throw new FamilyError(503,"주민 기록을 불러올 수 없습니다.");
  return {revision:row.revision,data:normalizeProgress(JSON.parse(row.progress_json))};
 }
 async readProgress(userId:string,roomId:string){const member=await this.requireMember(userId,roomId);return this.progressRow(member.playerId);}
 async interact(userId:string,roomId:string,expectedRevision:unknown,raw:unknown,rawPose:unknown):Promise<ProgressResult>{
  const member=await this.requireMember(userId,roomId),pose=parseFamilyPose(rawPose);
  if(!pose||!raw||typeof raw!=="object"||!Number.isSafeInteger(expectedRevision))throw new FamilyError(400,"주민 행동을 확인해 주세요.");
  const action=raw as ProgressAction;
  if(!["talk","gift","event-start","event-complete","quest-start","quest-deliver","quest-reward"].includes(action.kind))throw new FamilyError(400,"없는 주민 행동입니다.");
  const npcId=action.kind==="talk"||action.kind==="gift"?action.npcId:action.kind==="event-start"||action.kind==="event-complete"?getRelationshipEvent(action.eventId)?.npcId:getQuest(action.questId)?.giver;
  if(!npcId||!getNpc(npcId))throw new FamilyError(400,"없는 주민 또는 의뢰입니다.");
  const progress=await this.progressRow(member.playerId);
  const conflict=()=>new FamilyError(409,"개인 기록이 갱신됐어요. 다시 대화해 주세요.");
  if(progress.revision!==expectedRevision)throw conflict();
  const state=new FamilyState(this.db,this.now,this.maps),snapshot=await state.read(userId,roomId);
  const npc=this.npcs.sample(snapshot.world.day,snapshot.npcTimeMinutes??snapshot.world.timeMinutes).find(n=>n.npcId===npcId);
  const npcMap=this.maps[pose.mapId];
  if(!npc||!npcMap||npc.mapId!==pose.mapId||Math.hypot(npc.x-pose.x,npc.y-pose.y)>96||!npcLineClear(npcMap,pose,npc))throw new FamilyError(400,"주민 가까이에서 이야기해 주세요.");
  const row=await this.db.prepare("SELECT world_json,inventories_json FROM family_state WHERE room_id=? AND revision=?").bind(roomId,snapshot.revision).first<{world_json:string;inventories_json:string}>();
  if(!row)throw conflict();
  const world=JSON.parse(row.world_json),inventories=JSON.parse(row.inventories_json) as Record<string,InventoryData>;
  const inventory=new Inventory(inventories[member.playerId]);
  let dialogue:ProgressResult["dialogue"],event:ProgressResult["event"],notice:ProgressResult["notice"];
  try {
    if(action.kind==="talk") {dialogue=talkToNpc(progress.data,npcId,snapshot.world.day,snapshot.npcTimeMinutes??snapshot.world.timeMinutes,snapshot.world.daySerial??snapshot.world.day);recordNpcGreeting(progress.data,npcId);}
    else if(action.kind==="gift") {
      if(typeof action.itemId!=="string"||!Object.hasOwn(ITEM_DEFINITIONS,action.itemId))throw new Error("없는 아이템은 선물할 수 없어요.");
      const gifted=giftToNpc(progress.data,inventory,npcId,action.itemId as ItemId,snapshot.world.daySerial??snapshot.world.day);
      if(gifted.error)throw new Error(gifted.error);
      notice=gifted.preference==="loved"?`정말 좋아하는 선물이에요! 호감도 +${gifted.points}`:gifted.preference==="disliked"?"마음은 고맙지만 취향에는 맞지 않았어요.":`고마워요! 호감도 +${gifted.points}`;
    } else if(action.kind==="event-start") {
      const started=startRelationshipEvent(progress.data,action.eventId,{daySerial:snapshot.world.daySerial??snapshot.world.day,timeMinutes:snapshot.npcTimeMinutes??snapshot.world.timeMinutes,mapId:pose.mapId,weather:weatherFor(roomId,snapshot.world.daySerial??snapshot.world.day).id});
      if(started.error||!started.event)throw new Error(started.error??"관계 이벤트를 시작할 수 없어요.");
      event=started.event;
    } else if(action.kind==="event-complete") {
      const error=completeRelationshipEvent(progress.data,action.eventId);if(error)throw new Error(error);notice="관계 이벤트를 완료했어요.";
    } else world.money=applyQuestAction(progress.data,inventory,world.money,action);
  }catch(error){throw new FamilyError(409,error instanceof Error?error.message:"의뢰를 확인해 주세요.");}
  // Both tables change in one D1 batch transaction. A unique receipt ties the world
  // update to this exact successful progress CAS, including concurrent retries.
  const receipt=crypto.randomUUID();inventories[member.playerId]={...inventories[member.playerId],...inventory.serialize()};
  const progressWrite=this.db.prepare(`UPDATE family_player_progress SET progress_json=?, revision=revision+1, updated_at=? WHERE player_id=? AND revision=? AND EXISTS (SELECT 1 FROM family_state WHERE room_id=? AND revision=?)`)
   .bind(JSON.stringify({...progress.data,_mutation:receipt}),this.now(),member.playerId,expectedRevision,roomId,snapshot.revision);
  const changesWorld=action.kind==="gift"||action.kind==="quest-deliver"||action.kind==="quest-reward";
  if(changesWorld){
    const results=await this.db.batch([progressWrite,this.db.prepare(`UPDATE family_state SET world_json=?,inventories_json=?,revision=revision+1,updated_at=? WHERE room_id=? AND revision=? AND EXISTS (SELECT 1 FROM family_player_progress WHERE player_id=? AND revision=? AND json_extract(progress_json,'$._mutation')=?)`)
      .bind(JSON.stringify(world),JSON.stringify(inventories),this.now(),roomId,snapshot.revision,member.playerId,progress.revision+1,receipt)]);
    if(results[0].meta.changes!==1||results[1].meta.changes!==1)throw conflict();
  }else if((await progressWrite.run()).meta.changes!==1)throw conflict();
  return {progress:{revision:progress.revision+1,data:progress.data},dialogue,event,notice,snapshot:changesWorld?await state.read(userId,roomId):undefined};
 }
}
