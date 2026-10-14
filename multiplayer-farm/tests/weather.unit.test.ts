import test from "node:test";
import assert from "node:assert/strict";
import { RAIN, RAIN_KINDS, makeWeatherPlan, ensureWeatherPlan, applyWeatherAt, coarseWeather, rainIntensity, weatherEventAt, WEATHER_EVENT_MINUTES, precipitationForDay } from "../shared/weather.js";
import { calendar } from "../shared/expansion.js";
import { newWorld, newMember, entity, type Actor } from "../shared/world.js";
import { legacyLayout } from "../shared/layout.js";
import { applyAction, nextDay } from "../shared/actions.js";
import { CROPS } from "../shared/content.js";
import { getSunState } from "../shared/sunlight.js";
import { entityTouchIntent } from "../client/touch-action.js";
import { rainParticleCount } from "../client/weather-effects.js";

test("daily precipitation has independent deterministic farm/day rolls over 28, 112 and 365 days",t=>{
  const seeds=Array.from({length:256},(_,i)=>i<128?i:Math.imul(i,2654435761)>>>0);
  for(const days of [28,112,365]) {
    let wet=0,pairs=0,min=days,max=0,maxDry=0,maxWet=0;
    for(const seed of seeds) {
      let count=0,dry=0,rain=0,previous=false;
      for(let day=1;day<=days;day++) {
        const hit=precipitationForDay(seed,day);
        assert.equal(hit,precipitationForDay(seed,day));
        if(hit){wet++;count++;rain++;dry=0;if(previous)pairs++;}else{dry++;rain=0;}
        maxDry=Math.max(maxDry,dry);maxWet=Math.max(maxWet,rain);previous=hit;
      }
      min=Math.min(min,count);max=Math.max(max,count);
    }
    const rate=wet/(days*seeds.length),adjacent=pairs/((days-1)*seeds.length);
    // Aggregate distribution and lag-one independence, not a quota for each farm.
    assert(rate>.28&&rate<.32);assert(adjacent>.075&&adjacent<.105);
    t.diagnostic(JSON.stringify({farms:seeds.length,days,wet,rate,adjacent,min,max,maxDry,maxWet}));
  }
  assert.notDeepEqual(Array.from({length:112},(_,i)=>precipitationForDay(42,i+1)),
    Array.from({length:112},(_,i)=>precipitationForDay(43,i+1)));
});

test("only nextDay rolls new precipitation; saved plans and all-day rain/shower durations survive loading",()=>{
  const w=newWorld(42,legacyLayout());w.entities={};
  for(const kind of RAIN_KINDS) {
    w.weatherPlan=makeWeatherPlan(42,w.day,"rain",kind);w.minute=600;
    const saved=JSON.stringify(w),loaded=JSON.parse(saved),plan=JSON.stringify(loaded.weatherPlan);
    ensureWeatherPlan(loaded);applyWeatherAt(loaded);
    assert.equal(JSON.stringify(loaded.weatherPlan),plan,"current saved plan must not reroll");
    for(const minute of [360,719,1000,1430])
      assert.equal(coarseWeather(loaded.weatherPlan,minute),kind==="shower" &&
        (minute<loaded.weatherPlan.startMinute || minute>=loaded.weatherPlan.endMinute)?"clear":"rain");
    if(kind!=="shower")assert.equal(rainIntensity(loaded.weatherPlan,720),1);
  }
  for(const seed of [0,1,42,43,99999,2147483647])for(const day of [2,28,56,84,85,112,113]) {
    w.seed=seed;w.day=day-1;w.entities={};nextDay(w);
    const base=precipitationForDay(seed,day)?calendar(day).season==="winter"?"snow":"rain":"clear";
    assert.equal(w.weatherPlan!.baseWeather,base);
    assert.equal(w.weather,coarseWeather(w.weatherPlan!,360));
    assert.deepEqual(w.weatherPlan,makeWeatherPlan(seed,day,base));
  }
});

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
