import test from "node:test";
import assert from "node:assert/strict";
import { applyAction } from "../shared/actions.js";
import { entity,newWorld,newMember,upgradeWorld,type Actor,type Command } from "../shared/world.js";
import { legacyLayout } from "../shared/layout.js";
import { ITEMS } from "../shared/content.js";
import { DEBRIS } from "../shared/nature.js";
import { naturalFlower,rockMaxHp } from "../shared/resources.js";
import { actionTiming,impactDelay,dropAppearDelay,toolMotion,type ActionFx } from "../shared/interaction.js";
function setup() {
  const w=newWorld(32,legacyLayout());w.entities={};w.members.a=newMember("a","A");
  const a:Actor={id:"a",x:304,y:272,area:"farm",facing:"down",stamina:100,running:false};
  const act=(type:string,extra:Partial<Command>={})=>{w.members.a!.stamina=100;return applyAction(w,a,{actionId:crypto.randomUUID(),type,...extra},{now:Date.now(),votes:new Set(),online:["a"]});};
  return {w,a,act};
}
test("all content-classified natural flowers: hand/scythe gather, axe/pick destroy without rewards",()=>{
  const {w,act}=setup();
  const flowers=Object.values(ITEMS).filter(i=>i.naturalHarvest==="flower");assert.equal(flowers.length,7);
  for(const item of flowers)for(const tool of ["hand","scythe","axe","pickaxe"] as const) {
    const e=entity("flower","farm","gather",304,304,item.assetId);e.item=item.id;w.entities[e.id]=e;
    const xp=w.members.a!.xp,quests=structuredClone(w.members.a!.quests),inventory=structuredClone(w.members.a!.inventory);
    const result=tool==="hand"?act("gather",{targetId:e.id}):act("useTool",{toolId:tool,targetId:e.id});
    assert(result.ok);assert.equal(result.fx?.outcome,"break");assert(!w.entities[e.id]);
    if(tool==="axe"||tool==="pickaxe") {
      assert.deepEqual(result.fx?.drops,[]);assert.equal(w.members.a!.xp,xp);assert.deepEqual(w.members.a!.quests,quests);
      assert.deepEqual(w.members.a!.inventory,inventory);
    } else assert.equal(result.fx?.drops[0]?.item,item.id);
  }
  for(const [kind,item] of [["crop","fairy_bloom"],["decoration","fairy_bloom"],["gather","sun_berry"],["gather","wild_herb"]]) {
    const e=entity("protected","farm",kind!,304,304,"forest_fairy_bloom");e.item=item!;w.entities[e.id]=e;
    assert(!naturalFlower(e));const before=structuredClone(e);
    for(const tool of ["axe","pickaxe","scythe"] as const){const r=act("useTool",{targetId:e.id,toolId:tool});assert(!r.ok);assert.deepEqual(e,before);}
  }
  const e=entity("flower","farm","gather",304,304,"farm_white_wildflower");e.item="wildflower_white";w.entities[e.id]=e;
  assert.throws(()=>act("gather",{targetId:e.id,toolId:"axe"}));
  assert.throws(()=>act("destroyFlower",{targetId:e.id,toolId:"hoe"}));assert(w.entities[e.id]);
});
test("all surface stones take one hit; mining nodes three, upgraded pick two, including saved rocks",()=>{
  for(const asset of [...DEBRIS.filter(d=>d.kind==="rock").map(d=>d.id),"forest_rock","mine_stone","mine_copper","forest_ore"])
    for(const level of [1,2]) {
      const {w,act}=setup();w.members.a!.toolLevels={axe:level,pickaxe:level};
      const e=entity("saved-rock","farm","rock",304,304,asset);e.hp=2;e.item=asset==="mine_copper"?"copper_ore":"stone";w.entities[e.id]=e;
      const point=[e.x,e.y],inventory=structuredClone(w.members.a!.inventory);upgradeWorld(w);
      const max=rockMaxHp(e);assert.equal(e.hp,max);assert.deepEqual([e.x,e.y],point);assert.deepEqual(w.members.a!.inventory,inventory);
      const hits=max===1?1:level>=2?2:3;
      for(let i=0;i<hits;i++) {
        const r=act("useTool",{toolId:"pickaxe",targetId:e.id});assert(r.ok);
        assert.equal(r.fx?.maxHp,max);assert.equal(r.fx?.outcome,i===hits-1?"break":"hit");
        if(i<hits-1){const hp:number=e.hp;upgradeWorld(w);assert.equal(e.hp,hp,"reconnect must not heal a damaged node");assert.equal(r.fx?.drops.length,0);}
        else assert.equal(r.fx?.drops.length,1);
      }
      assert(!w.entities[e.id]);assert.throws(()=>act("hitRock",{targetId:e.id}));
    }
});
test("action timing separates tree/branch motion, contact precedes destruction and drop appearance",()=>{
  const {w,act}=setup();
  for(const [kind,asset,tool,motion] of [["tree","tree_oak","axe","horizontal_chop"],["twig","farm_twig_a","axe","overhead_chop"],["rock","farm_stone_a","pickaxe","overhead_mine"],["gather","farm_short_grass","scythe","horizontal_cut"]] as const) {
    const e=entity("target","farm",kind,304,304,asset);e.item=kind==="gather"?"grass":"wood";e.species="tree_oak";e.stage=2;e.hp=1;w.entities[e.id]=e;
    const fx=act("useTool",{toolId:tool,targetId:e.id}).fx!;
    assert.equal(toolMotion(fx),motion);const t=actionTiming(fx);
    assert(t.windup<t.impact && t.impact<t.follow && t.follow<t.duration);
    assert.equal(impactDelay(fx),t.impact);assert(dropAppearDelay(fx)>t.impact);
    assert.equal(fx.point?.y,304);
  }
  const hand={tool:"hand"} as ActionFx;assert(impactDelay(hand)>0,"flower stays visible during the reach");
});
