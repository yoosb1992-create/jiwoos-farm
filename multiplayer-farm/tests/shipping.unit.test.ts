import test from "node:test";
import assert from "node:assert/strict";
import { newWorld, newMember, upgradeWorld, type Actor, type Command } from "../shared/world.js";
import { applyAction, parseCommand, nextDay } from "../shared/actions.js";
import { shippingPositionSafe, ensureShippingCrate } from "../shared/shipping-placement.js";
import { settleShipping } from "../shared/shipping.js";
import { transactionQuote, parseQuantity } from "../shared/transactions.js";
import { reviewLayout } from "../shared/layout-application.js";
import { validateLayout } from "../shared/layout.js";
import { ITEMS, RECIPES } from "../shared/content.js";
function setup() {
  const w=newWorld(42), m=w.members.a=newMember("a","A");
  const crate=Object.values(w.entities).find(e=>e.kind==="shipping")!;
  const a:Actor={id:"a",area:"farm",x:crate.x,y:crate.y+40,facing:"up",running:false,stamina:100};
  const ctx={now:Date.now(),online:["a"],votes:new Set<string>()};
  const act=(type:string,extra:Partial<Command>={})=>applyAction(w,a,parseCommand({actionId:crypto.randomUUID(),type,...extra}),ctx);
  return {w,m,crate,a,act};
}
test("official and old farm receive one reachable house-right crate without changing progress",()=>{
  const {w,crate}=setup();assert.equal(crate.x/32,67);assert.equal(crate.y/32,31.5);
  assert.equal(shippingPositionSafe(w,67,31.5,crate.id),true);
  const before=structuredClone(w);delete w.entities[crate.id];w.layout!.maps.farm!.objects=w.layout!.maps.farm!.objects.filter(o=>o.id!==crate.id);w.version=11;
  upgradeWorld(w);assert.deepEqual(w.members,before.members);
  for(const [id,e] of Object.entries(before.entities))assert.deepEqual(w.entities[id],e);
  const saved=JSON.stringify(w);upgradeWorld(w);assert.equal(JSON.stringify(w),saved);
  assert.equal(Object.values(w.entities).filter(e=>e.kind==="shipping").length,1);
});
test("occupied preferred spot uses a safe alternative; no space requests owner placement",()=>{
  const {w,crate}=setup();delete w.entities[crate.id];w.layout!.maps.farm!.objects=w.layout!.maps.farm!.objects.filter(o=>o.id!==crate.id);
  w.entities.blocker={...crate,id:"blocker",kind:"crop",asset:"crop_sproutberry_mature"};
  const crop=structuredClone(w.entities.blocker);ensureShippingCrate(w);assert.deepEqual(w.entities.blocker,crop);
  const other=Object.values(w.entities).find(e=>e.kind==="shipping")!;assert.ok(other);assert.notDeepEqual([other.x,other.y],[crate.x,crate.y]);
  delete w.entities[other.id];w.layout!.maps.farm!.objects=w.layout!.maps.farm!.objects.filter(o=>o.id!==other.id);
  w.layout!.maps.farm!.collisionRegions=[{startX:0,endX:127,startY:0,endY:87}];
  assert.equal(ensureShippingCrate(w),false);assert.equal(w.shippingPlacementNeeded,true);assert.deepEqual(w.entities.blocker,crop);
});
test("shipping, partial return, ownership and one-time morning settlement survive reload",()=>{
  const {w,m,crate,a,act}=setup();m.inventory.sunpotato=30;
  const gold=m.money;act("shipItem",{targetId:crate.id,itemId:"sunpotato",quantity:25});
  assert.equal(m.inventory.sunpotato,5);assert.equal(m.money,gold);const lot=m.shipping!.pending[0]!;
  act("withdrawShipment",{targetId:crate.id,shipmentId:lot.id,quantity:7});assert.equal(m.inventory.sunpotato,12);assert.equal(lot.quantity,18);
  w.members.b=newMember("b","B");a.id="b";assert.throws(()=>act("withdrawShipment",{targetId:crate.id,shipmentId:lot.id}));assert.equal(lot.quantity,18);
  a.id="a";const restored=JSON.parse(JSON.stringify(w));upgradeWorld(restored);nextDay(restored);
  const total=18*ITEMS.sunpotato!.sellPrice!;assert.equal(restored.members.a.money,gold+total);assert.equal(restored.members.a.shipping.pending.length,0);assert.equal(restored.members.a.shipping.reports[0].total,total);
  settleShipping(restored,1);assert.equal(restored.members.a.money,gold+total);
  assert.throws(()=>applyAction(restored,a,parseCommand({actionId:crypto.randomUUID(),type:"withdrawShipment",targetId:crate.id,shipmentId:lot.id}),{now:Date.now(),online:["a"],votes:new Set()}));
});
test("editor relocates crate without changing pending shipments and rejects duplicate or blocked positions",()=>{
  const {w,m,crate,act}=setup();m.inventory.sunpotato=3;act("shipItem",{targetId:crate.id,itemId:"sunpotato",quantity:3});
  const layout=structuredClone(w.layout!);const object=layout.maps.farm!.objects.find(o=>o.id===crate.id)!;
  const candidate=Array.from({length:80},(_,i)=>({x:66.5+i%10,y:25.5+Math.floor(i/10)})).find(p=>shippingPositionSafe(w,p.x,p.y,crate.id));assert.ok(candidate);
  object.position={tileX:candidate.x,tileY:candidate.y};const moved=reviewLayout(w,layout);
  assert.deepEqual(moved.review.conflicts,[]);assert.deepEqual(moved.world.members,w.members);assert.equal(moved.world.entities[crate.id]!.x,candidate.x*32);
  object.position={tileX:60,tileY:29};assert.ok(reviewLayout(w,layout).review.conflicts.length);
  layout.maps.farm!.objects.push({...object,id:"duplicate"});assert.throws(()=>validateLayout(layout));
});
test("quantities reject malformed input and account for gold, stacks, slots and recipe outputs",()=>{
  for(const bad of ["","0","-1","1.5","1e2","abc","1 2","9007199254740992"])assert.equal(parseQuantity(bad),undefined);
  assert.equal(parseQuantity("37"),37);const m=newMember("a","A");m.money=1200;m.inventory={wood:137};
  assert.equal(transactionQuote({type:"buyItem",itemId:"stamina_biscuit"},m,1).max,120);
  assert.equal(transactionQuote({type:"depositChest",itemId:"wood"},m,1,{wood:999990}).max,9);
  m.inventory.wood=6000;assert.equal(transactionQuote({type:"depositChest",itemId:"wood"},m,1).max,999);
  const recipe=RECIPES.wood_plank!;m.inventory.wood=recipe.ingredients.find(i=>i.itemId==="wood")!.quantity*12;
  assert.equal(transactionQuote({type:"craftItem",itemId:"wood_plank"},m,1).max,12);
  m.inventory=Object.fromEntries(Object.keys(ITEMS).filter(id=>id!=="stamina_biscuit").slice(0,48).map(id=>[id,1]));
  assert.equal(transactionQuote({type:"buyItem",itemId:"stamina_biscuit"},m,1).max,0);
});
