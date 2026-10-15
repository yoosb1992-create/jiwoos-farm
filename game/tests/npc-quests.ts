import {strict as assert} from "node:assert";
import {normalizeProgress} from "../npc/progress";
import {questViews,applyQuestAction,recordNpcGreeting} from "../quests/engine";
import {QUEST_DEFINITIONS} from "../quests/definitions";
import {Inventory,normalizeSaveData} from "../domain";
import {familyTestDB} from "./family-db";
import {FamilyRooms} from "../../server/family/rooms";
import {FamilyState} from "../../server/family/state";
import {FamilyProgress} from "../../server/family/progress";
import {NpcController} from "../npc/NpcController";
import {NPC_DEFINITIONS} from "../npc/definitions";
import {MapRegistry} from "../maps/MapRegistry";
const p=normalizeProgress(null), inv=new Inventory();let money=120;
assert.equal(questViews(p,inv)[0].status,"available");assert.equal(questViews(p,inv)[1].status,"locked");
assert.throws(()=>applyQuestAction(p,inv,money,{kind:"quest-reward",questId:"village_hello"}));
applyQuestAction(p,inv,money,{kind:"quest-start",questId:"village_hello"});
for(const id of ["daon","boram","soli","soli"])recordNpcGreeting(p,id);
assert.equal(p.quests.village_hello.status,"completed");assert.equal(p.quests.village_hello.talked.length,3);
money=applyQuestAction(p,inv,money,{kind:"quest-reward",questId:"village_hello"});assert.equal(money,140);
assert.throws(()=>applyQuestAction(p,inv,money,{kind:"quest-reward",questId:"village_hello"}));
for(const q of QUEST_DEFINITIONS.filter(q=>q.objective.kind==="deliver")){
 applyQuestAction(p,inv,money,{kind:"quest-start",questId:q.id});
 assert.throws(()=>applyQuestAction(p,inv,money,{kind:"quest-deliver",questId:q.id}));
 if(q.objective.kind!=="deliver")continue;
 inv.add(q.objective.itemId,q.objective.amount);
 applyQuestAction(p,inv,money,{kind:"quest-deliver",questId:q.id});assert.equal(inv.count(q.objective.itemId),0);
 money=applyQuestAction(p,inv,money,{kind:"quest-reward",questId:q.id});assert.equal(p.quests[q.id].status,"rewarded");
}
assert.equal(normalizeSaveData({version:4,playerProgress:p})!.playerProgress!.quests.pond_picnic.status,"rewarded");
const {db,close}=familyTestDB();const now=()=>1000000;
try{
 const rooms=new FamilyRooms(db,now),state=new FamilyState(db,now),progress=new FamilyProgress(db,now);
 const {room}=await rooms.create("quest-a","퀘스트 농장","A");const b=await rooms.join("quest-b",room.inviteCode,"B");
 await state.read("quest-a",room.id);let personal=await progress.readProgress("quest-a",room.id);
 const poses=new NpcController(NPC_DEFINITIONS,new MapRegistry()).sample(1,360);
 const pose=(id:string)=>({...poses.find(p=>p.npcId===id)!,selectedTool:"hand",moving:false});
 const act=async(action:Parameters<typeof progress.interact>[3],npcId:string)=>{const result=await progress.interact("quest-a",room.id,personal.revision,action,pose(npcId));personal=result.progress;return result;};
 await act({kind:"quest-start",questId:"village_hello"},"boram");
 for(const id of ["daon","boram","soli"])await act({kind:"talk",npcId:id},id);
 const rewarded=await act({kind:"quest-reward",questId:"village_hello",money:999999,items:{sproutberry:999}},"boram");
 assert.equal(rewarded.snapshot!.world.money,140);assert.equal(rewarded.snapshot!.inventory.items.morningcarrot_seed,2);
 assert.equal((await state.read("quest-b",room.id)).world.money,140);assert.equal((await state.read("quest-b",room.id)).inventory.items.morningcarrot_seed,undefined);
 assert.equal((await progress.readProgress("quest-b",room.id)).data.quests.village_hello,undefined);
 await assert.rejects(()=>act({kind:"quest-reward",questId:"village_hello"},"boram"));
 assert.equal((await state.read("quest-a",room.id)).world.money,140);
 await act({kind:"quest-start",questId:"first_basket"},"daon");
 await assert.rejects(()=>act({kind:"quest-deliver",questId:"first_basket"},"daon"));
 // Seed an earned harvest in this isolated SQLite fixture only.
 await db.prepare("UPDATE family_state SET inventories_json=json_set(inventories_json,?,json(?)),revision=revision+1 WHERE room_id=?").bind(`$.\"${room.playerId}\"`,JSON.stringify({items:{sproutberry:1}}),room.id).run();
 const oldRevision=personal.revision;
 await act({kind:"quest-deliver",questId:"first_basket"},"daon");
 assert.equal((await state.read("quest-a",room.id)).inventory.items.sproutberry,0);
 await assert.rejects(()=>progress.interact("quest-a",room.id,oldRevision,{kind:"quest-deliver",questId:"first_basket"},pose("daon")));
 // Force the second statement of the reward transaction to fail; progress must roll back too.
 const brokenDB={...db,prepare:(sql:string)=>db.prepare(sql.startsWith("UPDATE family_state SET world_json=?,inventories_json=?")?"UPDATE nonexistent_table SET x=1 WHERE a=? AND b=? AND c=? AND d=? AND e=? AND f=? AND g=? AND h=?":sql)};
 const broken=new FamilyProgress(brokenDB,now);
 await assert.rejects(()=>broken.interact("quest-a",room.id,personal.revision,{kind:"quest-reward",questId:"first_basket"},pose("daon")));
 assert.equal((await progress.readProgress("quest-a",room.id)).data.quests.first_basket.status,"completed");
 assert.equal((await state.read("quest-a",room.id)).world.money,140);
 await act({kind:"quest-reward",questId:"first_basket"},"daon");
 assert.equal((await state.read("quest-a",room.id)).world.money,180);
 assert.equal((await progress.readProgress("quest-a",room.id)).data.quests.first_basket.status,"rewarded");
 assert.ok(b.room.playerId!==room.playerId);
}finally{close();}
console.log("Village quests: locked/start/greet/deliver/complete/reward, personal isolation, server rewards, replay and transaction rollback passed");
