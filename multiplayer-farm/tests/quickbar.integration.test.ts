import test from "node:test";
import assert from "node:assert/strict";
import { matchMaker } from "@colyseus/core";
import { action,fixture,join,until,type TestRoom } from "./helpers.js";
import type { Member } from "../shared/world.js";
import type { FarmRoom } from "../server/FarmRoom.js";

function personal(room:TestRoom):Promise<Member> {
  return new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>{off();reject(new Error("personal state timeout"));},5000);
    const off=room.onMessage("personal",(value:{member:Member})=>{clearTimeout(timeout);off();resolve(value.member);});
    room.send("personal");
  });
}
test("quickbar deltas persist across room disposal and same-player reconnect, isolated from family members",async()=>{
  const f=await fixture();let restored:TestRoom|undefined;
  try {
    const beforeA=await personal(f.A),beforeB=await personal(f.B);
    for(const edit of [{action:"assign",slotId:1,itemId:"scythe"},{action:"clear",slotId:4},
      {action:"favorite-add",itemId:"axe"},{action:"favorite-add",itemId:"water"},
      {action:"favorite-move",itemId:"water",direction:-1},{action:"favorite-select",itemId:"water"}] as const)
      assert((await action(f.A,"updateQuickbar",{quickbarEdit:edit})).ok);
    const afterA=await personal(f.A);
    assert.deepEqual(afterA.inventory,beforeA.inventory);
    assert.deepEqual((await personal(f.B)).quickbar,beforeB.quickbar);
    assert.deepEqual(afterA.quickbar!.favorites,["water","axe"]);
    const roomId=f.A.roomId;
    // Listing removal happens before the async PostgreSQL checkpoint/unlock.
    // disconnect() awaits onDispose; client leave() alone does not.
    await (matchMaker.getLocalRoomById(roomId) as FarmRoom).disconnect();
    await until(()=>!matchMaker.getLocalRoomById(roomId),10000);
    restored=await join(f.url,f.a);
    assert.deepEqual((await personal(restored)).quickbar,afterA.quickbar);
    assert.deepEqual((await personal(restored)).inventory,beforeA.inventory);
  } finally {await restored?.leave();await f.close();}
});
