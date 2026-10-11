import test from "node:test";
import assert from "node:assert/strict";
import { applyAction, parseCommand } from "../shared/actions.js";
import { newWorld, newMember, entity, addDrop, upgradeWorld, type Actor, type Command } from "../shared/world.js";
import { legacyLayout } from "../shared/layout.js";
import { FARM_GRASS, DEBRIS } from "../shared/nature.js";
import { DropIndex, pickupRadius, cuttableGrass } from "../shared/interaction.js";

function fixture() {
  const w=newWorld(42,legacyLayout());w.entities={};w.members.a=newMember("a","A");
  const a:Actor={id:"a",area:"farm",x:304,y:272,facing:"down",running:false,stamina:100};
  const act=(type:string,extra:Partial<Command>={})=>applyAction(w,a,{actionId:crypto.randomUUID(),type,...extra},{now:Date.now(),online:["a"],votes:new Set()});
  return {w,a,act};
}
test("starter scythe is additive for saved members; only grass/weeds can be cut",()=>{
  const {w,act}=fixture();delete w.members.a!.inventory.scythe;w.members.a!.inventory.wood=19;
  upgradeWorld(w);assert.equal(w.members.a!.inventory.scythe,1);assert.equal(w.members.a!.inventory.wood,19);
  for(const def of [...FARM_GRASS,...DEBRIS.filter(d=>d.id.startsWith("farm_weed"))]) {
    const e=entity(def.id,"farm","gather",304,304,def.id);e.item=def.item;w.entities[e.id]=e;
    assert.throws(()=>act("gather",{targetId:e.id}),/낫/);
    const r=act("useTool",{toolId:"scythe",targetId:e.id});
    assert(r.ok);assert.equal(r.fx?.outcome,"break");assert.equal(r.fx?.drops[0]?.item,def.item);assert(!w.entities[e.id]);
  }
  for(const kind of ["crop","gather"]) {
    const e=entity("protected","farm",kind,304,304,"farm_white_wildflower");e.item="wildflower_white";w.entities[e.id]=e;
    const before=structuredClone(e),count=w.nextEntity;
    const r=act("useTool",{toolId:"scythe",targetId:e.id});assert(!r.ok);assert.equal(r.fx?.outcome,"fail");
    assert.deepEqual(w.entities[e.id],before);assert.equal(w.nextEntity,count);assert(!cuttableGrass(e));
    if(kind==="gather")assert(act("gather",{targetId:e.id}).ok);
  }
});
test("wrong tools animate a server-confirmed attempt without HP, inventory or drop mutations",()=>{
  const {w,act}=fixture();
  for(const [kind,tool] of [["rock","axe"],["tree","pickaxe"],["rock","scythe"],["tree","scythe"]] as const) {
    const e=entity("resource","farm",kind,304,304,kind);e.hp=3;w.entities[e.id]=e;
    const inventory=structuredClone(w.members.a!.inventory),next=w.nextEntity;
    const r=act("useTool",{targetId:e.id,toolId:tool});
    assert.equal(r.ok,false);assert.equal(r.fx?.tool,tool);assert.equal(r.fx?.outcome,"fail");
    assert.equal(e.hp,3);assert.equal(w.nextEntity,next);assert.deepEqual(w.members.a!.inventory,inventory);
  }
  assert.throws(()=>parseCommand({actionId:"forged-tool",type:"useTool",toolId:"laser"}));
  assert.throws(()=>act("hitRock",{targetId:"resource",toolId:"axe"}));
});
test("pickup authority is one tile, area-bound, capacity-safe and idempotent",()=>{
  const {w,a,act}=fixture();const drop=addDrop(w,{area:"farm",x:a.x+33,y:a.y},"wood",1);
  assert.throws(()=>act("pickupDrop",{targetId:drop.id}));drop.x=a.x+pickupRadius();
  const index=new DropIndex();index.rebuild(Object.values(w.entities));assert.equal(index.nearby("forest",a.x,a.y).length,0);
  assert.equal(index.nearby("farm",a.x,a.y)[0]?.id,drop.id);
  assert(act("pickupDrop",{targetId:drop.id}).ok);assert.throws(()=>act("pickupDrop",{targetId:drop.id}));
  assert.equal(w.members.a!.inventory.wood,1);
  const blocked=addDrop(w,a,"stone",1);for(let i=0;Object.keys(w.members.a!.inventory).length<48;i++)w.members.a!.inventory[`test-${i}`]=1;
  assert.throws(()=>act("pickupDrop",{targetId:blocked.id}),/가방/);assert(w.entities[blocked.id]);
});
