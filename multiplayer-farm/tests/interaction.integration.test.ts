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
    const id=crypto.randomUUID();const hit=await action(f.A,"useTool",{actionId:id,toolId:"axe",targetId:rock.id});
    assert(!hit.ok);assert.equal(hit.fx?.outcome,"fail");
    assert.equal((await action(f.A,"useTool",{actionId:id,toolId:"axe",targetId:rock.id})).revision,hit.revision);
    await until(()=>events.some(e=>e.id===id));assert.equal(events.filter(e=>e.id===id).length,1);
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
