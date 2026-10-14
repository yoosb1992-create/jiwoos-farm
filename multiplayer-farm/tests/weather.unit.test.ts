import test from "node:test";
import assert from "node:assert/strict";
import { RAIN, RAIN_KINDS, makeWeatherPlan, ensureWeatherPlan, applyWeatherAt, coarseWeather, rainIntensity, weatherEventAt, WEATHER_EVENT_MINUTES } from "../shared/weather.js";
import { newWorld, newMember, entity, type Actor } from "../shared/world.js";
import { legacyLayout } from "../shared/layout.js";
import { applyAction, nextDay } from "../shared/actions.js";
import { CROPS } from "../shared/content.js";
import { getSunState } from "../shared/sunlight.js";
import { entityTouchIntent } from "../client/touch-action.js";
import { rainParticleCount } from "../client/weather-effects.js";

test("rain profiles, bounded mobile batches, cloud light and deterministic sound/lightning intervals",()=>{
  let prior=0;
  for(const kind of RAIN_KINDS) {
    const p=RAIN[kind];assert(p.cloudReduction>prior);prior=p.cloudReduction;
    assert(p.lightningChance<p.thunderChance || kind==="drizzle");
    assert(rainParticleCount(390,844,p.density)<=200);assert(rainParticleCount(2560,1600,p.density)<=280);
    const clear=getSunState({day:42,minute:765}),wet=getSunState({day:42,minute:765,cloudReduction:p.cloudReduction});
    assert(wet.ambientLight<clear.ambientLight);assert(wet.sunlightIntensity<clear.sunlightIntensity);
    assert.equal(getSunState({day:14,minute:1380,cloudReduction:p.cloudReduction}).ambientLight,getSunState({day:14,minute:1380}).ambientLight);
    let sound=0,light=0;
    for(let seed=0;seed<1000;seed++) {
      const plan=makeWeatherPlan(seed,1,"rain",kind);plan.startMinute=0;plan.endMinute=1440;
      for(let minute=400;minute<1440;minute+=WEATHER_EVENT_MINUTES) {
        const event=weatherEventAt(plan,minute);assert.deepEqual(event,weatherEventAt(JSON.parse(JSON.stringify(plan)),minute));
        if(event){sound++;if(event.lightning){light++;assert(event.thunderDelayMs>=450);}else assert.equal(event.thunderDelayMs,0);}
      }
    }
    if(kind==="drizzle"){assert.equal(sound,0);assert.equal(light,0);}else {assert(sound>light);assert(light>0);}
  }
  assert(rainParticleCount(390,844,RAIN.storm.density)>rainParticleCount(390,844,RAIN.drizzle.density)*3);
});
test("legacy rain is retained; showers smoothly start/end and wet only exposed plots once",()=>{
  const w=newWorld(42,legacyLayout());w.entities={};w.weather="rain";
  assert.equal(ensureWeatherPlan(w).kind,"rain");assert.equal(coarseWeather(w.weatherPlan!,360),"rain");
  w.weatherPlan=makeWeatherPlan(w.seed,w.day,"rain","shower");const p=w.weatherPlan;
  const soil=entity("soil","farm","soil",304,304,"tile_farm_empty"),inside=entity("inside","farmhouse","soil",304,304,"tile_farm_empty");w.entities={soil,inside};
  for(const [minute,value] of [[p.startMinute-1,0],[p.startMinute+6,.5],[p.startMinute+12,1],[p.endMinute-6,.5],[p.endMinute,0]])assert.equal(rainIntensity(p,minute!),value);
  w.minute=p.startMinute-1;applyWeatherAt(w);assert.equal(w.weather,"clear");assert(!soil.watered);
  w.minute=p.startMinute;assert(applyWeatherAt(w));assert(soil.watered);assert(!inside.watered);
  soil.watered=false;assert.equal(applyWeatherAt(w),false);assert(!soil.watered,"no per-tick scan");soil.watered=true;
  w.minute=p.endMinute;applyWeatherAt(w);assert.equal(w.weather,"clear");assert(soil.watered);
});
test("harvest preserves rain/manual moisture including regrow; planting and next morning remain consistent",()=>{
  for(const wet of [false,true])for(const rain of [false,true])for(const crop of Object.values(CROPS)) {
    const w=newWorld(42,legacyLayout());w.entities={};w.members.a=newMember("a","A");w.weather=rain?"rain":"clear";
    const e=entity("soil-farm-9-9","farm","crop",304,304,"tile_farm_empty");Object.assign(e,{crop:crop.id,stage:crop.growthDays,watered:wet});w.entities[e.id]=e;
    const a:Actor={id:"a",area:"farm",x:304,y:272,facing:"down",running:false,stamina:100};
    assert(applyAction(w,a,{actionId:crypto.randomUUID(),type:"harvestCrop",tileX:9,tileY:9},{now:1000,online:["a"],votes:new Set()}).ok);
    assert.equal(e.watered,wet||rain);assert.equal(e.kind,crop.regrowDays?"crop":"soil");
  }
  const w=newWorld(42,legacyLayout());w.entities={};w.members.a=newMember("a","A");w.weather="rain";
  const e=entity("soil-farm-9-9","farm","soil",304,304,"tile_farm_empty");w.entities[e.id]=e;
  const a:Actor={id:"a",area:"farm",x:304,y:272,facing:"down",running:false,stamina:100};
  assert(applyAction(w,a,{actionId:crypto.randomUUID(),type:"plantSeed",itemId:"sproutberry_seed",tileX:9,tileY:9},{now:1000,online:["a"],votes:new Set()}).ok);assert(e.watered);
  nextDay(w);assert.equal(e.stage,1);assert.equal(e.watered,w.weather==="rain");
});
test("touch prioritizes facilities and correct tools; no implicit recovery/transport/planting",()=>{
  for(const tool of ["hand","axe","pickaxe","hoe","scythe","water","sproutberry_seed","pine_cone"]) {
    for(const kind of ["chest","craft","bed","board","well","machine","animal","decoration","ladder"])
      assert.deepEqual(entityTouchIntent(entity("e","farm",kind,0,0,""),tool),{mode:"interact"});
    for(const [kind,asset,expected] of [["tree","tree_pine","axe"],["stump","tree_pine","axe"],["twig","farm_twig_a","axe"],["rock","farm_stone_a","pickaxe"],["gather","farm_short_grass","scythe"],["gather","farm_white_wildflower","hand"],["drop","wood","hand"]])
      assert.equal(entityTouchIntent(entity("e","farm",kind!,0,0,asset!),tool).tool,expected);
    const soil=entity("s","farm","soil",0,0,"");assert.equal(entityTouchIntent(soil,tool).mode,tool==="water"?"action":"move");soil.watered=true;assert.equal(entityTouchIntent(soil,tool).mode,"move");
    const crop=entity("c","farm","crop",0,0,"");Object.assign(crop,{crop:"sproutberry",stage:CROPS.sproutberry!.growthDays,watered:true});assert.equal(entityTouchIntent(crop,tool).action,"harvestCrop");
  }
});
