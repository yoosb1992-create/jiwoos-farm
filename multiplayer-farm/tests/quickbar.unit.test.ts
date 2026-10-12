import test from "node:test";
import assert from "node:assert/strict";
import { defaultQuickbar, editQuickbar, ensureQuickbar, expandQuickbar, ownedItem, visualSlots } from "../shared/quickbar.js";
import { newMember, newWorld, upgradeWorld, type Actor } from "../shared/world.js";
import { applyAction, parseCommand } from "../shared/actions.js";
import { legacyLayout } from "../shared/layout.js";
import { itemCategory } from "../shared/item-categories.js";

test("bottom-origin IDs survive row and column expansion without moving registrations",()=>{
  const bar=defaultQuickbar();
  assert.deepEqual(visualSlots(bar).map(s=>s.slotId),[4,5,6,7,1,2,3]);
  assert.deepEqual(bar.slots.find(s=>s.slotId===1),{slotId:1,rowFromBottom:0,column:0,itemId:"hand"});
  const three=expandQuickbar(bar,3,4);
  assert.deepEqual(visualSlots(three).map(s=>s.slotId),[8,9,10,11,4,5,6,7,1,2,3]);
  const four=expandQuickbar(three,4,4);
  assert.deepEqual(visualSlots(four).map(s=>s.slotId),[12,13,14,15,8,9,10,11,4,5,6,7,1,2,3]);
  const wider=expandQuickbar(four,4,5);
  assert.deepEqual(wider.slots.filter(s=>s.slotId<16),four.slots);
  assert.equal(wider.slots.find(s=>s.rowFromBottom===0&&s.column===3)?.slotId,16);
  assert(!wider.slots.some(s=>s.rowFromBottom===0&&s.column===4));
  assert.equal(new Set(wider.slots.map(s=>s.slotId)).size,19);
});
test("assign, replace and clear never grant or consume inventory; missing stock stays unavailable",()=>{
  const m=newMember("a","A"),inventory=structuredClone(m.inventory);
  editQuickbar(m,{action:"assign",slotId:3,itemId:"axe"});
  editQuickbar(m,{action:"assign",slotId:3,itemId:"scythe"});
  assert.equal(m.quickbar!.slots[2]!.itemId,"scythe");
  delete m.inventory.scythe;
  assert(!ownedItem(m,m.quickbar!.slots[2]!.itemId));
  assert.throws(()=>editQuickbar(m,{action:"assign",slotId:2,itemId:"scythe"}));
  m.inventory.scythe=1;assert(ownedItem(m,m.quickbar!.slots[2]!.itemId));
  editQuickbar(m,{action:"clear",slotId:3});assert.equal(m.quickbar!.slots[2]!.itemId,null);
  assert.deepEqual(m.inventory,inventory);assert(ownedItem({inventory:{}},"hand"));
  assert.throws(()=>editQuickbar(m,{action:"assign",slotId:8,itemId:"axe"}));
});
test("favorites are independent, ordered, replaceable and enforce ownership on selection",()=>{
  const m=newMember("a","A");
  for(const itemId of ["axe","hoe","water"])editQuickbar(m,{action:"favorite-add",itemId});
  editQuickbar(m,{action:"favorite-move",itemId:"water",direction:-1});
  editQuickbar(m,{action:"favorite-replace",previousItemId:"hoe",itemId:"scythe"});
  editQuickbar(m,{action:"favorite-select",itemId:"scythe"});
  assert.deepEqual(m.quickbar!.favorites,["axe","water","scythe"]);
  assert.equal(m.quickbar!.selectedFavorite,"scythe");
  assert.equal(m.quickbar!.slots.find(s=>s.slotId===4)?.itemId,"axe");
  delete m.inventory.scythe;
  assert.throws(()=>editQuickbar(m,{action:"favorite-select",itemId:"scythe"}));
  editQuickbar(m,{action:"favorite-remove",itemId:"scythe"});assert.equal(m.quickbar!.selectedFavorite,null);
});
test("legacy fallback and JSON reload retain intentional empty choices and isolate players",()=>{
  const w=newWorld(41,legacyLayout());w.members.a=newMember("a","A");w.members.b=newMember("b","B");
  delete w.members.a.quickbar;ensureQuickbar(w.members.a);
  const a:Actor={id:"a",area:"farm",x:800,y:800,facing:"down",running:false,stamina:100};
  const b=structuredClone(w.members.b),before=structuredClone(w.members.a.inventory);
  for(const edit of [{action:"clear",slotId:1},{action:"favorite-add",itemId:"hoe"},{action:"favorite-select",itemId:"hoe"}] as const)
    applyAction(w,a,parseCommand({actionId:crypto.randomUUID(),type:"updateQuickbar",quickbarEdit:edit}),{now:Date.now(),online:["a","b"],votes:new Set()});
  const saved=JSON.parse(JSON.stringify(w));upgradeWorld(saved);
  assert.deepEqual(saved.members.a.quickbar,w.members.a.quickbar);assert.equal(saved.members.a.quickbar.slots[0].itemId,null);
  assert.deepEqual(w.members.b,b);assert.deepEqual(w.members.a.inventory,before);
  assert.throws(()=>parseCommand({actionId:"bad-edit-id",type:"updateQuickbar",quickbarEdit:{action:"expand",rows:8}}));
  delete w.members.a.inventory.axe;
  assert.throws(()=>applyAction(w,a,{actionId:"no-owned-axe",type:"useTool",toolId:"axe"},{now:Date.now(),online:["a"],votes:new Set()}));
});
test("metadata categories include saplings, harvest, food, placement and unknown fallback",()=>{
  for(const [id,category] of [["axe","tools"],["pine_cone","seeds"],["sproutberry_seed","seeds"],["sproutberry","harvest"],["wood","materials"],["stamina_biscuit","food"],["storage_chest","placeable"],["future_unknown","other"]])assert.equal(itemCategory(id!),category,id);
});
