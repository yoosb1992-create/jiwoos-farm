import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { newWorld, newMember, entity, upgradeWorld, seedFarmDebris, random, type Actor, type World } from "../shared/world.js";
import { applyAction, nextDay, parseCommand } from "../shared/actions.js";
import { defaultLayout, validateLayout } from "../shared/layout.js";
import { TREE_SPECIES, TREES, TREE_STAGES, TREE_STAGE_IDS, DEBRIS, treeHp, natureRoll, treeSprite } from "../shared/nature.js";
import { initializeTree, growTrees, naturalPlacement, fencedInterior } from "../shared/nature-world.js";
import { newWorld2, setCell, terrainCode, ZONES } from "../shared/world2.js";
import { ASSETS, ITEMS, CROPS } from "../shared/content.js";
import { NEW_CROP_ART } from "../shared/nature-assets.js";
import { SEASONS, SEASON_DAYS } from "../shared/expansion.js";
import { objectFor, CATALOG, category } from "../client/editor/catalog.js";
function setup() {
  const l=defaultLayout(),m=l.maps.farm!;
  Object.assign(m,{width:40,height:40,baseTileType:"grass",world2:newWorld2(),objects:[],spawns:[{id:"farm_entry",tileX:2.5,tileY:2.5,facing:"down"}],warps:[],collisionRegions:[],farmAreas:[]});
  const w=newWorld(725,l); w.entities={}; w.members.a=newMember("a","A");w.members.b=newMember("b","B");
  const a:Actor={id:"a",area:"farm",x:20.5*32,y:19.5*32,facing:"down",running:false,stamina:100};
  return {w,a,m:w.layout!.maps.farm!};
}
let seq=0;
function act(w:World,a:Actor,type:string,more={}) {
  return applyAction(w,a,parseCommand({actionId:`nature-test-${++seq}`,type,...more}),{now:Date.now(),online:["a"],votes:new Set()});
}
test("nature planting: eight items, atomic contested planting, front/range and forged stage rejection",()=>{
  for(const t of TREE_SPECIES){
    const {w,a}=setup();w.members.a!.inventory[t.seed]=1;
    assert.throws(()=>act(w,a,"plantTree",{itemId:t.seed,tileX:21,tileY:20}));
    assert.equal(w.members.a!.inventory[t.seed],1);
    act(w,a,"plantTree",{itemId:t.seed,stage:4,species:"tree_bamboo",x:1,y:1});
    const e=Object.values(w.entities)[0]!;
    assert.equal(e.species,t.id);assert.equal(e.stage,0);assert(e.planted);assert.equal(e.x,20.5*32);
    assert.equal(w.members.a!.inventory[t.seed],undefined);
    w.members.b!.inventory[t.seed]=1;
    assert.throws(()=>act(w,{...a,id:"b"},"plantTree",{itemId:t.seed}));
    assert.equal(w.members.b!.inventory[t.seed],1);
  }
});
test("five persisted stages: species days, deterministic rare promotions, minimum old age, no reroll on reload",()=>{
  assert.equal(TREE_STAGES.length,5);
  for(const t of TREE_SPECIES){
    const {w,a}=setup();w.members.a!.inventory[t.seed]=1;act(w,a,"plantTree",{itemId:t.seed});
    const e=Object.values(w.entities)[0]!;
    for(let i=0;i<t.days[0];i++)nextDay(w);
    assert.equal(e.stage,1);
    for(let i=0;i<t.days[1];i++)nextDay(w);
    assert.equal(e.stage,2);
    const matureDay=w.day;
    w.day=matureDay+13;growTrees(w);assert.equal(e.stage,2);
    let d=matureDay+t.giantMinDays;
    while(natureRoll(w.seed,d,e.id,"giant")>=t.giantChance)d++;
    w.day=d;growTrees(w);assert.equal(e.stage,3);assert.equal(e.treeStageDay,d);
    const copy=JSON.parse(JSON.stringify(w)) as World;upgradeWorld(copy);growTrees(copy);assert.deepEqual(copy.entities[e.id],e);
    w.day=d+27;growTrees(w);assert.equal(e.stage,3);
    d+=t.guardianMinDays;while(natureRoll(w.seed,d,e.id,"guardian")>=t.guardianChance)d++;
    w.day=d;copy.day=d;growTrees(w);growTrees(copy);assert.equal(e.stage,4);assert.deepEqual(copy.entities[e.id],e);
  }
});
test("every species has correct drops, mature/giant/guardian hits and three-hit stumps at both tool levels",()=>{
  for(const t of TREE_SPECIES)for(const stage of [2,3,4])for(const level of [1,2]){
    const {w,a}=setup(),e=entity("harvest-tree","farm","tree",a.x,a.y+32,t.id);
    e.stage=stage;e.species=t.id;e.hp=treeHp(stage);initializeTree(w,e);w.entities[e.id]=e;w.members.a!.toolLevel=level;
    const hits=Math.ceil(treeHp(stage)/(level===2?2:1));
    for(let i=0;i<hits;i++){act(w,a,"hitTree",{targetId:e.id});assert.equal(e.kind,i===hits-1?"stump":"tree");}
    const drops=Object.values(w.entities).filter(e=>e.kind==="drop").map(e=>e.item).sort();
    assert.deepEqual(drops,t.drops.filter(d=>natureRoll(w.seed,w.day,e.id,`drop-${d.item}`)<d.chance).map(d=>d.item).sort());
    for(let i=0;i<2;i++){act(w,a,"hitTree",{targetId:e.id});assert(w.entities[e.id]);}
    act(w,a,"hitTree",{targetId:e.id});assert(!w.entities[e.id]);
  }
});
test("natural forest trees persist across days and retained stumps regrow after seven days",()=>{
  const w=newWorld(725), tree=w.entities["forest-1-0"]!;
  assert(tree.regrow);
  tree.kind="stump";tree.asset="stump";tree.hp=3;
  for(let i=0;i<6;i++)nextDay(w);
  assert.equal(w.entities[tree.id],tree);assert.equal(tree.kind,"stump");
  nextDay(w);assert.equal(tree.kind,"tree");assert.equal(tree.stage,0);
  assert.equal(Object.values(w.entities).filter(e=>e.area==="forest" && e.kind==="tree").length,12);
});
test("natural placement protects paths/water/soil/crops/warps/spawns/collision/facilities/trees and enclosed gardens",()=>{
  for(const terrain of ["dirt_path","stone_path","water","tilled_soil"]){const {w,m}=setup();setCell(m,"terrain",20,20,terrainCode(terrain));assert(!naturalPlacement(w,"farm",20,20,"tree"));assert(!naturalPlacement(w,"farm",20,20,"debris"));}
  for(const kind of ["soil","crop","withered","decoration","machine","tree","stump","twig"]){const {w,a}=setup();w.entities.x=entity("x","farm",kind,a.x,a.y+32,"");w.entities.x.watered=true;assert(!naturalPlacement(w,"farm",20,20,"tree"));assert(!naturalPlacement(w,"farm",20,20,"debris"));}
  const {w,m}=setup();assert(naturalPlacement(w,"farm",20,20,"tree"));setCell(m,"zones",20,20,ZONES["no-placement"]);assert(!naturalPlacement(w,"farm",20,20,"tree"));setCell(m,"zones",20,20,0);
  setCell(m,"collision",20,20,1);assert(!naturalPlacement(w,"farm",20,20,"tree"));setCell(m,"collision",20,20,0);
  assert(!naturalPlacement(w,"farm",2,2,"tree"));
  m.warps.push({id:"exit",area:{startX:20,endX:20,startY:20,endY:20},targetMapId:"road",targetSpawnId:"farm_entrance"});assert(!naturalPlacement(w,"farm",20,20,"tree"));m.warps=[];
  for(let i=18;i<=22;i++)for(const [x,y] of [[i,18],[i,22],[18,i],[22,i]])w.entities[`${x},${y}`]=entity(`${x},${y}`,"farm","decoration",(x!+.5)*32,(y!+.5)*32,"fence_horizontal");
  assert(fencedInterior(w,"farm").has("20,20"));assert(!naturalPlacement(w,"farm",20,20,"debris",fencedInterior(w,"farm")));
});
test("debris 30 first day, 2–6 daily, max 50, idempotent daily spawning and cleared tile respite",()=>{
  const {w}=setup();w.debrisDay=0;seedFarmDebris(w,random(12));assert.equal(Object.keys(w.entities).length,30);
  seedFarmDebris(w,random(12));assert.equal(Object.keys(w.entities).length,30);
  const debris=Object.values(w.entities)[0]!;const x=Math.floor(debris.x/32),y=Math.floor(debris.y/32);
  w.members.a!.stamina=100;const a={id:"a",area:"farm",x:debris.x,y:debris.y-32,facing:"down",running:false,stamina:100};
  act(w,a,debris.kind==="twig"?"clearTwig":debris.kind==="rock"?"hitRock":"gather",{targetId:debris.id});
  for(const [id,e] of Object.entries(w.entities))if(e.kind==="drop")delete w.entities[id];
  assert(!naturalPlacement(w,"farm",x,y,"debris"));
  let previous=29;for(let day=2;day<25;day++){w.day=day;seedFarmDebris(w,random(day));const n=Object.keys(w.entities).length;assert(n<=50);assert(n>=Math.min(50,previous+2)&&n<=Math.min(50,previous+6));previous=n;}
  assert.equal(previous,50);assert.equal(DEBRIS.length,22);
});
test("old trees migrate additively; editor roundtrip, stage art, species and nature thumbnails resolve",()=>{
  const {w,m}=setup();w.version=3;const before=structuredClone(w.members);
  const old=entity("old-pine","farm","tree",500,500,"tree_variant_b");delete (old as Partial<typeof old>).stage;w.entities[old.id]=old;
  upgradeWorld(w);assert.equal(old.stage,2);assert.equal(old.species,"tree_pine");assert.deepEqual(w.members,before);
  const once=JSON.stringify(w);upgradeWorld(w);assert.equal(JSON.stringify(w),once);
  for(const t of TREE_SPECIES){const o=objectFor(t.id,25,25);o.tree!.stage=4;o.tree!.planted=true;const edit=defaultLayout();edit.maps.farm!.objects.push(o);const layout=validateLayout(edit);assert.equal(layout.maps.farm!.objects.find(x=>x.id===o.id)!.tree!.planted,true);assert(CATALOG.includes(t.id));assert.equal(category(t.id),"Trees");
    for(const stage of TREE_STAGE_IDS){const asset=ASSETS[`${t.id}_${stage}`]!;assert(asset.source);assert(existsSync(new URL(`../../public${asset.source.path}`,import.meta.url)));}
    assert(ITEMS[t.seed]);assert(ASSETS[treeSprite(t.id,2,"winter")]);
  }
  for(const d of DEBRIS)assert(ASSETS[d.id]?.source);
  const manifest=JSON.parse(readFileSync(new URL('../../public/assets/nature/manifest.json',import.meta.url),'utf8'));
  assert(manifest.assets.length>=103);
});
test("expanded crops resolve original art and seasonal seed sales; seven tree items are sold and rare seed is drop-only",()=>{
  const {w,a}=setup();a.area="general_store";w.members.a!.money=100000;
  for(const id of NEW_CROP_ART) {
    const c=CROPS[id]!;assert(c);assert(ITEMS[c.seedItemId]);
    assert(ASSETS[`crop_${id}_mature`]!.source!.path.endsWith(`/crops/${id}.webp`));
    w.day=1+SEASONS.indexOf(c.seasons[0]!)*SEASON_DAYS;
    const before=w.members.a!.inventory[c.seedItemId]??0;
    act(w,a,"buyItem",{itemId:c.seedItemId});assert.equal(w.members.a!.inventory[c.seedItemId],before+1);
    w.day=1+SEASONS.indexOf(SEASONS.find(s=>!c.seasons.includes(s))!)*SEASON_DAYS;
    assert.throws(()=>act(w,a,"buyItem",{itemId:c.seedItemId}));
  }
  for(const t of TREE_SPECIES) {
    if(t.seedPrice)act(w,a,"buyItem",{itemId:t.seed});
    else assert.throws(()=>act(w,a,"buyItem",{itemId:t.seed}));
  }
});
