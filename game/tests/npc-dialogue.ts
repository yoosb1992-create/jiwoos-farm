import {strict as assert} from "node:assert";
import {selectDialogue,nearestNpc} from "../npc/dialogue";
import {NPC_DEFINITIONS} from "../npc/definitions";
for(const n of NPC_DEFINITIONS){
 const first=selectDialogue(n,1,360,{met:false,cursor:0});assert.deepEqual(first.lines,n.dialogue.first);
 const morning=selectDialogue(n,1,360,first.memory);assert.deepEqual(morning.lines,n.dialogue.morning[0]);
 const next=selectDialogue(n,1,360,morning.memory);assert.notDeepEqual(next.lines,morning.lines);
 assert.deepEqual(selectDialogue(n,1,800,first.memory).lines,n.dialogue.afternoon[0]);
 assert.deepEqual(selectDialogue(n,1,1200,first.memory).lines,n.dialogue.evening[0]);
 const seen=new Set<string>();let memory=first.memory;
 for(let i=0;i<8;i++){const d=selectDialogue(n,8,800,memory);seen.add(JSON.stringify(d.lines));memory=d.memory;}
 assert.ok(seen.has(JSON.stringify(n.dialogue.progress[0].lines)));
 if(n.dialogue.relationship?.length){let relationshipMemory=first.memory,found=false;for(let i=0;i<12;i++){const d=selectDialogue(n,8,800,relationshipMemory,80);found ||= d.lines===n.dialogue.relationship[0].lines;relationshipMemory=d.memory;}assert.equal(found,true);}
}
assert.equal(nearestNpc([{npcId:"a",mapId:"town",x:10,y:10,moving:false,facing:"down",activity:""}],{mapId:"farm",x:10,y:10}),undefined);
console.log("NPC dialogue: first meeting, periods, progress, non-repeating cycle and map proximity passed");
