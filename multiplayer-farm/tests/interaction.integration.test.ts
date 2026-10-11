import test from "node:test";
import assert from "node:assert/strict";
import { matchMaker } from "@colyseus/core";
import { fixture,action,until,delay,join } from "./helpers.js";
import type { FarmRoom } from "../server/FarmRoom.js";
import { addDrop,entity,type World } from "../shared/world.js";
import type { ActionFx } from "../shared/interaction.js";

test("committed failed swings reach peers once; nearby automatic pickup has one durable owner",async()=>{
  const f=await fixture();
  try {
    const room=matchMaker.getLocalRoomById(f.A.roomId) as FarmRoom;
    const access=room as unknown as {world:World;sync():void};
    const rock=entity("fx-test-rock","farm","rock",304,304,"farm_stone_a");rock.hp=2;
    access.world.entities[rock.id]=rock;
    for(const r of [f.A,f.B])Object.assign(room.state.players.get(r.sessionId)!,{x:304,y:272,area:"farm",facing:"down",running:false});
    access.sync();const events:ActionFx[]=[];f.B.onMessage("actionFx",(e:ActionFx)=>events.push(e));
    const stamina=room.state.players.get(f.A.sessionId)!.stamina;
    const id=crypto.randomUUID();const hit=await action(f.A,"useTool",{actionId:id,toolId:"axe",targetId:rock.id});
    assert(!hit.ok);assert.equal(hit.fx?.outcome,"fail");
    assert.equal((await action(f.A,"useTool",{actionId:id,toolId:"axe",targetId:rock.id})).revision,hit.revision);
    await until(()=>events.some(e=>e.id===id));assert.equal(events.filter(e=>e.id===id).length,1);
    assert.equal(access.world.members[f.a.playerId]!.stamina,stamina-3,"failed swing is durably charged once even when replayed");
    await until(()=>f.B.state.players.get(f.A.sessionId)?.stamina===stamina-3);
    assert.equal(access.world.entities[rock.id]!.hp,2);assert.equal(access.world.members[f.a.playerId]!.inventory.stone,undefined);
    const drop=addDrop(access.world,{area:"farm",x:304,y:305},"stone",1);access.sync();
    await delay(250);assert(access.world.entities[drop.id],"33px must not attract");
    // Both authoritative actors enter the 32px radius on the same simulation step.
    for(const r of [f.A,f.B])room.state.players.get(r.sessionId)!.y=274;
    await until(()=>!f.A.state.entities.has(drop.id)&&!access.world.entities[drop.id]);
    const members=[f.a,f.b];assert.equal(members.reduce((n,m)=>n+(access.world.members[m.playerId]!.inventory.stone??0),0),1);
    await until(()=>events.filter(e=>e.outcome==="pickup"&&e.target?.id===drop.id).length===1);
    assert.equal((await action(f.A,"pickupDrop",{targetId:drop.id})).ok,false);
    const winner=members.find(m=>access.world.members[m.playerId]!.inventory.stone===1)!;
    if(winner===f.a)await f.A.leave();else await f.B.leave();
    const reconnect=await join(f.url,winner);
    try {await delay(150);assert(!reconnect.state.entities.has(drop.id));assert.equal(access.world.members[winner.playerId]!.inventory.stone,1);}
    finally {await reconnect.leave();}
  } finally {await f.close();}
});

test("empty watering commits cost/animation once, syncs to peers and survives reconnection",async()=>{
  const f=await fixture();
  try {
    const room=matchMaker.getLocalRoomById(f.A.roomId) as FarmRoom;
    const access=room as unknown as {world:World;sync():void};
    const p=room.state.players.get(f.A.sessionId)!;
    Object.assign(p,{x:16,y:16,area:"farm",facing:"left",stamina:100,running:false});
    access.sync();const events:ActionFx[]=[];f.B.onMessage("actionFx",(e:ActionFx)=>events.push(e));
    const actionId=crypto.randomUUID(),water=access.world.members[f.a.playerId]!.water;
    const result=await action(f.A,"useTool",{actionId,toolId:"water"});
    assert(!result.ok);assert.equal(result.fx?.tool,"water");assert.equal(result.fx?.action,"waterCrop");
    assert.equal(access.world.members[f.a.playerId]!.stamina,99);assert.equal(access.world.members[f.a.playerId]!.water,water);
    const replay=await action(f.A,"useTool",{actionId,toolId:"water"});assert.equal(replay.revision,result.revision);
    await until(()=>f.B.state.players.get(f.A.sessionId)?.stamina===99 && events.some(e=>e.id===actionId));
    assert.equal(events.filter(e=>e.id===actionId).length,1);
    await f.A.leave();const reconnected=await join(f.url,f.a);
    try {
      assert.equal(room.state.players.get(reconnected.sessionId)!.stamina,99);
      assert.equal((await action(reconnected,"useTool",{actionId,toolId:"water"})).revision,result.revision);
      assert.equal(access.world.members[f.a.playerId]!.stamina,99);
    } finally {await reconnected.leave();}
  } finally {await f.close();}
});

test("concurrent flower tools commit one result; destruction never creates hidden client-only rewards",async()=>{
  const f=await fixture();
  try {
    const room=matchMaker.getLocalRoomById(f.A.roomId) as FarmRoom;
    const access=room as unknown as {world:World;sync():void};
    for(const tool of ["axe","pickaxe","scythe","hand"] as const) {
      const flower=entity(`flower-${tool}`,"farm","gather",304,304,"farm_pink_wildflower");flower.item="wildflower_pink";
      access.world.entities[flower.id]=flower;
      for(const r of [f.A,f.B])Object.assign(room.state.players.get(r.sessionId)!,{x:304,y:272,area:"farm",facing:"down",stamina:100,actionTicks:0});
      access.sync();await delay(240);
      const before=Object.values(access.world.members).reduce((sum,m)=>sum+m.xp,0),id=crypto.randomUUID();
      const type=tool==="hand"?"gather":"useTool",extra={targetId:flower.id,...(tool==="hand"?{}:{toolId:tool})};
      const results=await Promise.all([action(f.A,type,{actionId:id,...extra}),action(f.B,type,extra)]);
      assert.equal(results.filter(r=>r.ok).length,1);const success=results.find(r=>r.ok)!;
      const harvest=tool==="hand"||tool==="scythe";
      assert.equal(success.fx?.drops.length,harvest?1:0);
      assert.equal(Object.values(access.world.members).reduce((sum,m)=>sum+m.xp,0),before);
      assert(!access.world.entities[flower.id]);
      if(results[0]!.ok)assert.equal((await action(f.A,type,{actionId:id,...extra})).revision,success.revision);
      await delay(1500);
      // Both stand on the exact 32px boundary. Only one member can own the drop.
      const total=Object.values(access.world.members).reduce((sum,m)=>sum+(m.inventory.wildflower_pink??0),0);
      assert.equal(total,tool==="hand"?2:tool==="scythe"?1:0);
    }
  }finally{await f.close();}
});
