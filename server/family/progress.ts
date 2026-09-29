import { npcLineClear } from "../../game/npc/navigation";
import { MAP_DEFINITIONS } from "../../game/maps/definitions";
import { Inventory, type InventoryData } from "../../game/domain";
import { getQuest } from "../../game/quests/definitions";
import { applyQuestAction, recordNpcGreeting } from "../../game/quests/engine";
import { FamilyRooms, FamilyError } from "./rooms";
import { FamilyState } from "./state";
import { normalizeProgress, talkToNpc, type ProgressSnapshot, type ProgressAction, type ProgressResult } from "../../game/npc/progress";
import { NpcController } from "../../game/npc/NpcController";
import { NPC_DEFINITIONS, getNpc } from "../../game/npc/definitions";
import { MapRegistry } from "../../game/maps/MapRegistry";
import { parseFamilyPose } from "../../game/family/personal";
const npcs=new NpcController(NPC_DEFINITIONS,new MapRegistry());
export class FamilyProgress extends FamilyRooms {
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
  if(!["talk","quest-start","quest-deliver","quest-reward"].includes(action.kind))throw new FamilyError(400,"없는 주민 행동입니다.");
  const npcId=action.kind==="talk"?action.npcId:getQuest(action.questId)?.giver;
  if(!npcId||!getNpc(npcId))throw new FamilyError(400,"없는 주민 또는 의뢰입니다.");
  const progress=await this.progressRow(member.playerId);
  const conflict=()=>new FamilyError(409,"개인 기록이 갱신됐어요. 다시 대화해 주세요.");
  if(progress.revision!==expectedRevision)throw conflict();
  const state=new FamilyState(this.db,this.now),snapshot=await state.read(userId,roomId);
  const npc=npcs.sample(snapshot.world.day,snapshot.npcTimeMinutes??snapshot.world.timeMinutes).find(n=>n.npcId===npcId);
  if(!npc||npc.mapId!==pose.mapId||Math.hypot(npc.x-pose.x,npc.y-pose.y)>96||!npcLineClear(MAP_DEFINITIONS[pose.mapId],pose,npc))throw new FamilyError(400,"주민 가까이에서 이야기해 주세요.");
  const row=await this.db.prepare("SELECT world_json,inventories_json FROM family_state WHERE room_id=? AND revision=?").bind(roomId,snapshot.revision).first<{world_json:string;inventories_json:string}>();
  if(!row)throw conflict();
  const world=JSON.parse(row.world_json),inventories=JSON.parse(row.inventories_json) as Record<string,InventoryData>;
  const inventory=new Inventory(inventories[member.playerId]);
  let dialogue:ProgressResult["dialogue"];
  try {
    if(action.kind==="talk") {dialogue=talkToNpc(progress.data,npcId,snapshot.world.day,snapshot.world.timeMinutes,snapshot.world.daySerial??snapshot.world.day);recordNpcGreeting(progress.data,npcId);}
    else world.money=applyQuestAction(progress.data,inventory,world.money,action);
  }catch(error){throw new FamilyError(409,error instanceof Error?error.message:"의뢰를 확인해 주세요.");}
  // Both tables change in one D1 batch transaction. A unique receipt ties the world
  // update to this exact successful progress CAS, including concurrent retries.
  const receipt=crypto.randomUUID();inventories[member.playerId]={...inventories[member.playerId],...inventory.serialize()};
  const progressWrite=this.db.prepare(`UPDATE family_player_progress SET progress_json=?, revision=revision+1, updated_at=? WHERE player_id=? AND revision=? AND EXISTS (SELECT 1 FROM family_state WHERE room_id=? AND revision=?)`)
   .bind(JSON.stringify({...progress.data,_mutation:receipt}),this.now(),member.playerId,expectedRevision,roomId,snapshot.revision);
  const changesWorld=action.kind==="quest-deliver"||action.kind==="quest-reward";
  if(changesWorld){
    const results=await this.db.batch([progressWrite,this.db.prepare(`UPDATE family_state SET world_json=?,inventories_json=?,revision=revision+1,updated_at=? WHERE room_id=? AND revision=? AND EXISTS (SELECT 1 FROM family_player_progress WHERE player_id=? AND revision=? AND json_extract(progress_json,'$._mutation')=?)`)
      .bind(JSON.stringify(world),JSON.stringify(inventories),this.now(),roomId,snapshot.revision,member.playerId,progress.revision+1,receipt)]);
    if(results[0].meta.changes!==1||results[1].meta.changes!==1)throw conflict();
  }else if((await progressWrite.run()).meta.changes!==1)throw conflict();
  return {progress:{revision:progress.revision+1,data:progress.data},dialogue,snapshot:changesWorld?await state.read(userId,roomId):undefined};
 }
}
