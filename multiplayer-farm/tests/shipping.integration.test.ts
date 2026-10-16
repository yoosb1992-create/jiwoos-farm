import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { matchMaker } from "@colyseus/core";
import type { FarmRoom } from "../server/FarmRoom.js";
import type { World } from "../shared/world.js";
import { ITEMS } from "../shared/content.js";
import { fixture, action, delay, join, until } from "./helpers.js";

test("simultaneous family shipments, durable duplicate receipts, owner-only returns, disconnect and morning settlement",async()=>{
 const f=await fixture();
 try {
  const room=matchMaker.getLocalRoomById(f.A.roomId) as FarmRoom;
  const world=()=> (room as unknown as {world:World}).world;
  const crate=Object.values(world().entities).find(e=>e.kind==="shipping")!;
  for(const [peer,identity] of [[f.A,f.a],[f.B,f.b],[f.C,f.c]] as const){
    Object.assign(room.state.players.get(peer.sessionId)!,{area:"farm",x:crate.x,y:crate.y+40});
    world().members[identity.playerId]!.inventory.sunpotato=20;
  }
  const command={actionId:randomUUID(),targetId:crate.id,itemId:"sunpotato",quantity:12};
  const [one,two]=await Promise.all([action(f.A,"shipItem",command),action(f.B,"shipItem",{...command,actionId:randomUUID(),quantity:7})]);
  assert.equal(one.ok,true,one.message);assert.equal(two.ok,true,two.message);
  const duplicate=await action(f.A,"shipItem",command);assert.equal(duplicate.revision,one.revision);
  assert.equal(world().members[f.a.playerId]!.inventory.sunpotato,8);
  await delay(230);
  const stolen=await action(f.C,"withdrawShipment",{targetId:crate.id,shipmentId:command.actionId,quantity:1});assert.equal(stolen.ok,false);
  const returned=await action(f.A,"withdrawShipment",{targetId:crate.id,shipmentId:command.actionId,quantity:3});assert.equal(returned.ok,true,returned.message);
  assert.equal(world().members[f.a.playerId]!.inventory.sunpotato,11);
  await room.disconnect();
  const A=await join(f.url,f.a),B=await join(f.url,f.b);
  const fresh=matchMaker.getLocalRoomById(A.roomId) as FarmRoom;
  let settledGold=0;
  try {
   const saved=()=> (fresh as unknown as {world:World}).world;
   assert.equal(saved().members[f.a.playerId]!.shipping!.pending[0]!.quantity,9);
   assert.equal(saved().members[f.b.playerId]!.shipping!.pending[0]!.quantity,7);
   assert.equal((await action(A,"shipItem",command)).revision,one.revision);
   const goldA=saved().members[f.a.playerId]!.money,goldB=saved().members[f.b.playerId]!.money;
   const voteA={actionId:randomUUID(),day:1},voteB={actionId:randomUUID(),day:1};
   assert.equal((await action(A,"sleepVote",voteA)).ok,true);
   assert.equal((await action(B,"sleepVote",voteB)).ok,true);
   await until(()=>A.state.day===2);
   assert.equal(saved().members[f.a.playerId]!.money,goldA+9*ITEMS.sunpotato!.sellPrice!);
   assert.equal(saved().members[f.b.playerId]!.money,goldB+7*ITEMS.sunpotato!.sellPrice!);
   await action(B,"sleepVote",voteB);await action(A,"sleepVote",voteA);
   assert.equal(saved().day,2);assert.equal(saved().members[f.a.playerId]!.money,goldA+9*ITEMS.sunpotato!.sellPrice!);
   assert.equal(saved().members[f.a.playerId]!.shipping!.pending.length,0);
   settledGold=saved().members[f.a.playerId]!.money;
   await delay(230);assert.equal((await action(A,"sleepVote",{day:1})).ok,false);
  }finally{await Promise.all([A.leave(),B.leave()]);}
  await fresh.disconnect();
  const afterMorning=await join(f.url,f.a);
  try {
   const reopened=(matchMaker.getLocalRoomById(afterMorning.roomId) as unknown as {world:World}).world;
   const member=reopened.members[f.a.playerId]!;
   assert.equal(reopened.day,2);assert.equal(member.money,settledGold);
   assert.equal(member.shipping!.pending.length,0);
   assert.equal(member.shipping!.reports.at(-1)!.total,9*ITEMS.sunpotato!.sellPrice!);
   assert.equal(member.shipping!.settledThrough,1);
  }finally{await afterMorning.leave();}
 }finally{await f.close();}
});
