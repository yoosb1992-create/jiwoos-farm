import test from "node:test";
import assert from "node:assert/strict";
import { matchMaker } from "@colyseus/core";
import { fixture, action, until, delay, join } from "./helpers.js";
import type { FarmRoom } from "../server/FarmRoom.js";
import { entity, type World } from "../shared/world.js";
import { naturalPlacement } from "../shared/nature-world.js";
import { stumpSprite } from "../shared/nature.js";
import { collidesWithObstacle } from "../shared/applyMovement.js";

test("real multiplayer tree planting consumes one seed, rejects contested/forged planting and persists across reconnect",async()=>{
  const f=await fixture();
  try {
    const room=matchMaker.getLocalRoomById(f.A.roomId) as FarmRoom;
    const world=(room as unknown as {world:World}).world;
    let tx=0,ty=0;
    outer:for(let y=35;y<80;y++)for(let x=30;x<100;x++)if(naturalPlacement(world,"farm",x,y,"tree")){tx=x;ty=y;break outer;}
    assert(tx);
    for(const r of [f.A,f.B])Object.assign(room.state.players.get(r.sessionId)!,{x:(tx+.5)*32,y:(ty-.5)*32,area:"farm",facing:"down",running:false});
    const before=[world.members[f.a.playerId]!.inventory.pine_cone!,world.members[f.b.playerId]!.inventory.pine_cone!];
    const results=await Promise.all([f.A,f.B].map(r=>action(r,"plantTree",{itemId:"pine_cone",tileX:tx,tileY:ty})));
    assert.equal(results.filter(r=>r.ok).length,1);
    await until(()=>[...f.C.state.entities.values()].filter(e=>e.id.startsWith("planted-tree-")).length===1);
    const tree=[...f.C.state.entities.values()].find(e=>e.id.startsWith("planted-tree-"))!;
    assert.equal(tree.stage,0);assert.equal(tree.species,"tree_pine");assert(tree.planted);
    const saved=(room as unknown as {world:World}).world;
    assert.equal(saved.members[f.a.playerId]!.inventory.pine_cone!+saved.members[f.b.playerId]!.inventory.pine_cone!,before[0]!+before[1]!-1);
    await delay(230);
    const bad=await action(f.A,"plantTree",{itemId:"pine_cone",tileX:tx+12,tileY:ty});assert.equal(bad.ok,false);
    f.A.send("state",{entities:{[tree.id]:{stage:4}}});await delay(100);assert.equal(f.C.state.entities.get(tree.id)!.stage,0);
    await f.A.leave();const again=await join(f.url,f.a);
    try {await until(()=>again.state.entities.has(tree.id));assert.equal(again.state.entities.get(tree.id)!.stage,0);}
    finally {await again.leave();}
  } finally {await f.close();}
});

test("juvenile removal and species/age stumps survive a room reload, with one felling reward and live collision",async()=>{
  const f=await fixture();
  try {
    const room=matchMaker.getLocalRoomById(f.A.roomId) as FarmRoom;
    const access=room as unknown as {world:World;sync():void};
    const x=1808,y=1808;
    // Isolated test farm only: clear a small fixture cell, never production data.
    for(const [id,e] of Object.entries(access.world.entities))if(e.area==="farm"&&Math.hypot(e.x-x,e.y-y)<100)delete access.world.entities[id];
    const juvenile=entity("saved-juvenile","farm","tree",x,y,"tree_pine");
    Object.assign(juvenile,{species:"tree_pine",stage:0,hp:1,regrow:true});access.world.entities[juvenile.id]=juvenile;
    for(const r of [f.A,f.B])Object.assign(room.state.players.get(r.sessionId)!,{x,y:y-32,area:"farm",facing:"down",actionTicks:0});
    access.sync();const actionId=crypto.randomUUID();
    const results=await Promise.all([action(f.A,"useTool",{actionId,toolId:"axe",targetId:juvenile.id}),action(f.B,"useTool",{toolId:"axe",targetId:juvenile.id})]);
    assert.equal(results.filter(r=>r.ok).length,1);assert.equal(results.find(r=>r.ok)!.fx!.drops.length,1);
    await until(()=>!f.C.state.entities.has(juvenile.id));
    assert(access.world.treeRegrowth?.[juvenile.id]);
    assert(!collidesWithObstacle(x,y,"farm",access.world.layout!.maps,Object.values(access.world.entities)));
    const rewardCount=access.world.nextEntity;
    if(results[0]!.ok)assert.equal((await action(f.A,"useTool",{actionId,toolId:"axe",targetId:juvenile.id})).revision,results[0]!.revision);
    assert.equal(access.world.nextEntity,rewardCount);
    const old=entity("saved-guardian","farm","tree",x+64,y,"tree_birch");
    Object.assign(old,{species:"tree_birch",stage:4,hp:1,regrow:false});access.world.entities[old.id]=old;
    Object.assign(room.state.players.get(f.A.sessionId)!,{x:x+64,y:y-32,actionTicks:0});access.sync();await delay(260);
    assert((await action(f.A,"useTool",{toolId:"axe",targetId:old.id})).ok);
    await until(()=>f.C.state.entities.get(old.id)?.kind==="stump");
    assert.equal(f.C.state.entities.get(old.id)!.asset,stumpSprite("tree_birch",4));
    assert(collidesWithObstacle(old.x,old.y,"farm",access.world.layout!.maps,Object.values(access.world.entities)));
    const roomId=room.roomId;
    await Promise.all([f.A.leave(),f.B.leave(),f.C.leave()]);
    await until(()=>!matchMaker.getLocalRoomById(roomId));
    const again=await join(f.url,f.a);
    try {
      const next=matchMaker.getLocalRoomById(again.roomId) as FarmRoom;
      const saved=(next as unknown as {world:World}).world;
      assert(saved.treeRegrowth?.[juvenile.id]);assert(!again.state.entities.has(juvenile.id));
      assert.equal(again.state.entities.get(old.id)!.asset,stumpSprite("tree_birch",4));
      assert.equal(again.state.entities.get(old.id)!.stage,4);
      Object.assign(next.state.players.get(again.sessionId)!,{x:old.x,y:old.y-32,area:"farm",facing:"down",actionTicks:0});
      for(let hit=0;hit<3;hit++){
        await delay(430);assert((await action(again,"useTool",{toolId:"axe",targetId:old.id})).ok);
        assert.equal((next as unknown as {world:World}).world.entities[old.id]?.hp,hit<2?2-hit:undefined);
      }
      await until(()=>!again.state.entities.has(old.id));
      // Commands swap the world transaction; read the latest committed snapshot.
      const final=(next as unknown as {world:World}).world;
      assert(!collidesWithObstacle(old.x,old.y,"farm",final.layout!.maps,Object.values(final.entities)));
    } finally {await again.leave();}
  }finally{await f.close();}
});
