import test from "node:test";
import assert from "node:assert/strict";
import { TouchNavigator } from "../client/navigation.js";
import { entityTouchIntent } from "../client/touch-action.js";
import { FarmState, WorldEntity } from "../shared/schema.js";
import { applyAction } from "../shared/actions.js";
import { frontTile } from "../shared/applyMovement.js";
import { CROPS } from "../shared/content.js";
import { legacyLayout } from "../shared/layout.js";
import { newWorld, newMember, entity, type Actor, type Command } from "../shared/world.js";
import type { RenderPlayer } from "../client/network.js";

test("four approaches retain exact front tile through till, seed, water, harvest and withered removal",()=>{
  const neutral={moveX:0,moveY:0,run:false};
  for(const [dx,dy,facing] of [[0,-1,"down"],[0,1,"up"],[-1,0,"right"],[1,0,"left"]] as const) {
    const w=newWorld(42,legacyLayout());w.entities={};w.members.a=newMember("a","A");w.weather="clear";
    const a:Actor={id:"a",area:"farm",x:304+dx*32,y:304+dy*32,facing,stamina:100,running:false};
    assert.deepEqual(frontTile(a),{tileX:9,tileY:9});
    const act=(type:string,extra:Partial<Command>={})=>applyAction(w,a,{actionId:crypto.randomUUID(),type,tileX:9,tileY:9,...extra},{now:1000,online:["a"],votes:new Set()});
    const neighbors=[entity("soil-farm-9-8","farm","soil",304,272,"tile_farm_empty"),entity("soil-farm-9-10","farm","soil",304,336,"tile_farm_empty")];
    for(const e of neighbors)w.entities[e.id]=e;
    const before=JSON.stringify(neighbors);
    for(const type of ["tillTile","plantSeed","harvestCrop"])
      assert.throws(()=>act(type,{tileY:10,itemId:"sproutberry_seed"}),/앞칸/);
    const rejectedWater=act("waterCrop",{tileY:10});assert(!rejectedWater.ok);assert.match(rejectedWater.message,/앞칸/);
    assert(act("tillTile").ok);assert(act("plantSeed",{itemId:"sproutberry_seed"}).ok);
    const crop=w.entities["soil-farm-9-9"]!;
    for(const kind of ["crop","withered"] as const) {
      crop.kind=kind;
      const state=new FarmState(),e=new WorldEntity();Object.assign(e,crop);state.entities.set(e.id,e);
      const me={...a,local:true,connected:true,moving:false,authoritativeX:a.x,authoritativeY:a.y} as RenderPlayer;
      let calls=0;
      const nav=new TouchNavigator(()=>assert.fail("unexpected path failure"),target=>{
        calls++;assert.equal(target.id,crop.id);assert.equal(target.x,304);assert.equal(target.y,304);
        assert(act(kind==="crop"?"waterCrop":"tillTile").ok);
      });
      nav.choose({x:304,y:304,entityId:e.id},me,state);
      nav.target!.intent=entityTouchIntent(crop,"water");
      nav.step(performance.now(),me,state,neutral,{sentInputs:10,acknowledgedInputs:10});assert.equal(calls,0);
      nav.step(performance.now(),me,state,neutral,{sentInputs:11,acknowledgedInputs:11});assert.equal(calls,1);
      nav.step(performance.now(),me,state,neutral);assert.equal(calls,1);
      if(kind==="crop") {
        crop.stage=CROPS.sproutberry!.growthDays;assert(act("harvestCrop").ok);assert(crop.watered);
        for(const drop of Object.values(w.entities).filter(e=>e.kind==="drop"))assert(act("pickupDrop",{targetId:drop.id}).ok);
      }
    }
    const cleared=w.entities[crop.id]!;
    assert.equal(cleared.kind,"soil");assert.equal(cleared.x,304);assert.equal(cleared.y,304);
    assert.equal(JSON.stringify(neighbors),before,"no action may affect the tile above or below");
  }
});
