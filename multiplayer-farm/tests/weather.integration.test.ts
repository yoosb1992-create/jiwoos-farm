import test from "node:test";
import assert from "node:assert/strict";
import { matchMaker } from "@colyseus/core";
import { fixture, action, until, join } from "./helpers.js";
import type { FarmRoom } from "../server/FarmRoom.js";
import { entity, type World } from "../shared/world.js";
import { makeWeatherPlan, weatherEventAt } from "../shared/weather.js";
import { CROPS } from "../shared/content.js";

test("live shower onset synchronizes wind/moisture; contested harvest drops once and persists through recovery",async()=>{
  const f=await fixture();
  try {
    const room=matchMaker.getLocalRoomById(f.A.roomId) as FarmRoom;
    const access=room as unknown as {world:World;sync():void};
    const w=access.world;w.weatherPlan=makeWeatherPlan(w.seed,w.day,"rain","shower");
    const plan=w.weatherPlan;plan.startMinute=800;plan.endMinute=1000;
    w.minute=799;w.weather="clear";delete w.rainWateredPeriod;
    const x=1808,y=1808;
    for(const [id,e] of Object.entries(w.entities))if(e.area==="farm"&&Math.hypot(e.x-x,e.y-y)<100)delete w.entities[id];
    const crop=entity("soil-farm-56-56","farm","crop",x,y,"tile_farm_empty");Object.assign(crop,{crop:"sproutberry",stage:CROPS.sproutberry!.growthDays,watered:false});w.entities[crop.id]=crop;
    Object.assign(room,{clockMinute:799,clockStarted:Date.now()});access.sync();
    for(const r of [f.A,f.B])Object.assign(room.state.players.get(r.sessionId)!,{x,y:y-32,area:"farm",facing:"down",running:false,actionTicks:0});
    await until(()=>[f.A,f.B,f.C].every(r=>r.state.weather==="rain"&&r.state.entities.get(crop.id)?.watered===true));
    assert.equal(f.A.state.weatherPlan,f.B.state.weatherPlan);assert.equal(f.A.state.weatherPlan,f.C.state.weatherPlan);
    assert.deepEqual(JSON.parse(f.A.state.weatherPlan),plan);
    const results=await Promise.all([f.A,f.B].map(r=>action(r,"harvestCrop",{tileX:56,tileY:56})));
    assert.equal(results.filter(r=>r.ok).length,1);
    await until(()=>f.C.state.entities.get(crop.id)?.kind==="soil");assert(f.C.state.entities.get(crop.id)!.watered);
    assert.equal(Object.values(access.world.entities).filter(e=>e.kind==="drop"&&e.item===CROPS.sproutberry!.harvestItemId).length,1);
    // Presentation event is one shared patch, derived from the saved plan.
    let seed=1;while(!weatherEventAt({...plan,seed},880))seed++;
    access.world.weatherPlan!.seed=seed;access.world.minute=879;Object.assign(room,{clockMinute:879,clockStarted:Date.now()});access.sync();
    await until(()=>!!f.A.state.weatherEvent&&f.A.state.weatherEvent===f.B.state.weatherEvent&&f.B.state.weatherEvent===f.C.state.weatherEvent);
    assert.equal(JSON.parse(f.A.state.weatherEvent).minute,880);
    await room.disconnect();const again=await join(f.url,f.a);
    try {assert(again.state.entities.get(crop.id)!.watered);assert.equal(JSON.parse(again.state.weatherPlan).seed,seed);assert.equal(again.state.weatherEvent,"","old flashes are not replayed by a reopened room");}
    finally{await again.leave();}
  } finally {await f.close();}
});
