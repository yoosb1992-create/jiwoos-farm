import test from "node:test";
import assert from "node:assert/strict";
import { matchMaker } from "@colyseus/core";
import { fixture, action, until, delay, join } from "./helpers.js";
import type { FarmRoom } from "../server/FarmRoom.js";
import type { World } from "../shared/world.js";
import { naturalPlacement } from "../shared/nature-world.js";

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
