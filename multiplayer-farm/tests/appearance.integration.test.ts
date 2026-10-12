import test from "node:test";
import assert from "node:assert/strict";
import { matchMaker } from "@colyseus/core";
import { action,fixture,join,until,type TestRoom } from "./helpers.js";
import { appearanceOf,DEFAULT_APPEARANCE,parseAppearance } from "../shared/appearance.js";
import { defaultLayout } from "../shared/layout.js";
import type { Member } from "../shared/world.js";
import type { FarmRoom } from "../server/FarmRoom.js";
const personal=(room:TestRoom):Promise<{member:Member;canDevelop:boolean}>=>new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{off();reject(Error("personal timeout"));},5000);
  const off=room.onMessage("personal",value=>{clearTimeout(timer);off();resolve(value);});room.send("personal");
});
test("appearance is validated, persisted before broadcast and isolated across players and devices",async()=>{
  const f=await fixture();let restored:TestRoom|undefined;
  try{
    const before=await personal(f.A),peer=await personal(f.B);
    assert.deepEqual(appearanceOf(before.member.appearance),DEFAULT_APPEARANCE);
    const look={...DEFAULT_APPEARANCE,gender:"female",height:"tall",hair:"ponytail",hairColor:"rose",top:"blue",bottom:"denim",shoes:"cream"} as const;
    const pos=f.A.state.players.get(f.A.sessionId)!;const xy=[pos.x,pos.y,pos.area];
    assert((await action(f.A,"updateAppearance",{appearance:look})).ok);
    await until(()=>f.B.state.players.get(f.A.sessionId)?.appearance===JSON.stringify(look));
    assert.deepEqual([pos.x,pos.y,pos.area],xy);
    const changed=await personal(f.A);
    assert.deepEqual(changed.member,{...before.member,appearance:look});
    assert.deepEqual((await personal(f.B)).member,peer.member);
    for(const invalid of [{...look,height:"giant"},{...look,version:9},{...look,isOwner:true}])
      assert.equal((await action(f.A,"updateAppearance",{appearance:invalid as any})).ok,false);
    assert.deepEqual((await personal(f.A)).member.appearance,look);
    const roomId=f.A.roomId;
    await (matchMaker.getLocalRoomById(roomId) as FarmRoom).disconnect();
    await until(()=>!matchMaker.getLocalRoomById(roomId),10000);
    // A fresh SDK instance holds no browser/local state. Only the established
    // bearer identity resumes the existing member from the durable snapshot.
    restored=await join(f.url,f.a);
    assert.deepEqual((await personal(restored)).member.appearance,look);
    assert.deepEqual((await personal(restored)).member.inventory,before.member.inventory);
    assert.deepEqual(appearanceOf(undefined),DEFAULT_APPEARANCE);
    assert.throws(()=>parseAppearance({...look,hair:"<script>"}));
  }finally{await restored?.leave();await f.close();}
});
test("developer display does not grant authority; owner sessions and scoped blueprint capabilities do",async()=>{
  const f=await fixture();
  try{
    const http=f.url.replace(/^ws/,"http"),owner={Authorization:`Bearer ${f.a.token}`},guest={Authorization:`Bearer ${f.b.token}`};
    assert.equal((await personal(f.A)).canDevelop,true);assert.equal((await personal(f.B)).canDevelop,false);
    assert.equal((await fetch(`${http}/api/developer`,{headers:owner})).status,200);
    assert.equal((await fetch(`${http}/api/developer`,{headers:guest})).status,403);
    const layout=defaultLayout();
    for(const headers of [{},guest,{Authorization:"Bearer forged-owner"}])
      assert.equal((await fetch(`${http}/api/blueprints`,{method:"POST",headers:{"Content-Type":"application/json",...headers},body:JSON.stringify(layout)})).status,403);
    const response=await fetch(`${http}/api/blueprints`,{method:"POST",headers:{"Content-Type":"application/json",...owner},body:JSON.stringify(layout)});
    assert.equal(response.status,200);const draft=await response.json() as {id:string;editToken:string};
    assert.equal((await fetch(`${http}/api/developer?blueprintId=${draft.id}`,{headers:{Authorization:`Bearer ${draft.editToken}`}})).status,200);
    assert.equal((await fetch(`${http}/api/developer?blueprintId=${draft.id}`,{headers:guest})).status,403);
    assert.equal((await fetch(`${http}/api/blueprints/${draft.id}`,{method:"POST",headers:{"Content-Type":"application/json",...guest},body:JSON.stringify({layout,revision:0,publish:true})})).status,400);
  }finally{await f.close();}
});
