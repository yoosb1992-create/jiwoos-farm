import test from "node:test";
import assert from "node:assert/strict";
import { applyAction, nextDay, parseCommand } from "../shared/actions.js";
import { newWorld, newMember, entity, upgradeWorld, type Actor, type Command } from "../shared/world.js";
import { legacyLayout } from "../shared/layout.js";
import { currentLightLevel, getSunState, sunlightProfile, seedGlowVisibility, SEASONAL_SUNLIGHT } from "../shared/sunlight.js";
import { atmosphereLight, groundShadow, objectSunTint } from "../client/solar-lighting.js";
import { CROP_VISUALS } from "../shared/crop-visuals.js";
import { CROPS } from "../shared/content.js";
import { TOOL_STAMINA_COST } from "../shared/tool-stamina.js";

function fixture() {
  const w = newWorld(42, legacyLayout()); w.entities = {}; w.members.a = newMember("a", "A");
  const a: Actor = { id: "a", area: "farm", x: 304, y: 272, facing: "down", stamina: 100, running: false };
  const act = (type: string, extra: Partial<Command> = {}) => applyAction(w, a,
    { actionId: crypto.randomUUID(), type, ...extra }, { now: 1000, online: ["a"], votes: new Set() });
  return { w, a, act, m: w.members.a! };
}
test("sunlit seeds fade continuously through dusk to zero; seasonal/exposure inputs compose", () => {
  const glow = (minute: number) => seedGlowVisibility(currentLightLevel({ minute }));
  assert(glow(720) > glow(1080) && glow(1080) > glow(1120));
  assert.equal(glow(1140), 0); assert.equal(glow(1380), 0); assert.equal(glow(300), 0);
  assert(glow(410) > 0 && glow(410) < glow(480));
  assert.equal(currentLightLevel({ minute: 720, exposure: 0 }), 0);
  const noon = getSunState({ minute: 720 }).solarNoon;
  assert(Math.abs(currentLightLevel({ minute: noon, seasonalSunModifier: .6 }) - .96 * .6) < 1e-12);
  assert.equal(currentLightLevel({ minute: 720, sunlightIntensity: .5, exposure: .5 }), .25);
  assert.equal(currentLightLevel({ minute: 1080, profile: { sunset: 1050 } }), 0);
  assert.equal(currentLightLevel({ minute: 400, profile: { sunrise: 450 } }), 0);
  for (const season of ["spring", "summer", "autumn", "winter"] as const)
    assert(Math.abs(currentLightLevel({ minute: getSunState({ minute: 720, season }).solarNoon, season }) - SEASONAL_SUNLIGHT[season].peakIntensity) < 1e-12);
  assert.equal(seedGlowVisibility(Number.NaN), 0);
  assert.deepEqual(Object.keys(CROP_VISUALS).sort(), Object.keys(CROPS).sort());
});
test("112-day solar year has continuous mid-season anchors and repeatable solstices", () => {
  const close = (a: number, b: number) => assert(Math.abs(a - b) < 1e-9, `${a} != ${b}`);
  for (const [day, sunrise, sunset, peak] of [[14.5,390,1125,.96],[42.5,330,1200,1],[70.5,390,1125,.96],[98.5,450,1050,.92]]) {
    const p = sunlightProfile(day!);
    close(p.sunrise, sunrise!); close(p.sunset, sunset!); close(p.peakIntensity, peak!);
    const next = sunlightProfile(day! + 112);
    for (const key of ["sunrise", "sunset", "peakIntensity", "maxElevation"] as const) close(p[key], next[key]);
  }
  const lengths = Array.from({length:112}, (_,i) => { const p=sunlightProfile(i+1); return p.sunset-p.sunrise; });
  assert.equal(lengths.indexOf(Math.max(...lengths)) + 1, 42);
  assert.equal(lengths.indexOf(Math.min(...lengths)) + 1, 98);
  for (const boundary of [29,57,85,113]) {
    const a=sunlightProfile(boundary-1e-6), b=sunlightProfile(boundary+1e-6);
    assert(Math.abs(a.sunrise-b.sunrise)<.00001); assert(Math.abs(a.sunset-b.sunset)<.00001);
    const before=sunlightProfile(boundary-1), after=sunlightProfile(boundary);
    assert(Math.abs(before.sunrise-after.sunrise)<3.4); assert(Math.abs(before.sunset-after.sunset)<4.3);
  }
  assert(lengths[40]! < lengths[41]! && lengths[43]! < lengths[42]!);
  assert(lengths[96]! > lengths[97]! && lengths[99]! > lengths[98]!);
});
test("sun moves east-high-west; light rises and fades with opposite bounded shadows", () => {
  for (const day of [14.5,42.5,70.5,98.5]) {
    const p=sunlightProfile(day), span=p.sunset-p.sunrise;
    const at=(t:number)=>getSunState({day,minute:p.sunrise+span*t});
    const morning=at(.15), noon=at(.5), evening=at(.85);
    assert(morning.sunDirectionX>0 && evening.sunDirectionX<0);
    assert(Math.abs(noon.sunDirectionX)<1e-10);
    assert(noon.sunElevation>morning.sunElevation && noon.sunElevation>evening.sunElevation);
    assert(at(0).sunElevation<1e-10 && Math.abs(at(1).sunElevation)<1e-10);
    for(let i=1;i<=50;i++) assert(at(i/100).sunlightIntensity>=at((i-1)/100).sunlightIntensity);
    for(let i=51;i<=100;i++) assert(at(i/100).sunlightIntensity<=at((i-1)/100).sunlightIntensity);
    for (const sun of [morning,noon,evening]) {
      assert(sun.sunDirectionX*sun.shadowDirectionX + sun.sunDirectionY*sun.shadowDirectionY < 0);
      assert(Math.abs(Math.hypot(sun.sunDirectionX,sun.sunDirectionY,sun.sunDirectionZ)-1)<1e-12);
      assert(sun.shadowLength<=2.8);
    }
    assert(morning.shadowLength>noon.shadowLength && evening.shadowLength>noon.shadowLength);
    for(const minute of [0,p.sunrise-1,p.sunrise,p.sunset,p.sunset+1,1439]) {
      const night=getSunState({day,minute,sunlightIntensity:1});
      assert.equal(night.sunlightIntensity,0); assert.equal(seedGlowVisibility(night.sunlightIntensity),0);
      assert(night.ambientLight>=.72);
      if(minute===0) assert(night.sunElevation<0);
    }
    for(const boundary of [p.sunrise,p.sunset]) {
      const a=getSunState({day,minute:boundary-.001}),b=getSunState({day,minute:boundary+.001});
      assert(Math.abs(a.ambientLight-b.ambientLight)<.00002);
      assert(Math.abs(a.sunDirectionX-b.sunDirectionX)<.0001);
    }
    assert.deepEqual(getSunState({day,minute:731}),getSunState(JSON.parse(JSON.stringify({day,minute:731}))),"peers only need identical authoritative clock values");
  }
  assert(getSunState({day:42.5,minute:765}).sunElevation>getSunState({day:98.5,minute:750}).sunElevation);
});
test("render response changes sides, preserves indoor/mine brightness and readable nights", () => {
  const morning=getSunState({day:42.5,minute:450}), evening=getSunState({day:42.5,minute:1080}), noon=getSunState({day:42.5,minute:765});
  const east=objectSunTint(0xffffff,morning), west=objectSunTint(0xffffff,evening);
  assert(east[1]>east[0]); assert(west[0]>west[1]);
  const rotated=objectSunTint(0xffffff,morning,Math.PI);
  assert(rotated[0]>rotated[1],"rotated art still receives world-east light");
  assert(groundShadow(morning,128,160).x<0); assert(groundShadow(evening,128,160).x>0);
  assert(groundShadow(morning,128,160).width>groundShadow(noon,128,160).width);
  assert(morning.warmth>noon.warmth && evening.warmth>noon.warmth);
  for(let minute=0;minute<1440;minute+=30) {
    const sun=getSunState({day:98.5,minute});
    const legacy=minute>=1140 ? Math.min(.32,(minute-1140)/800) : minute<420 ? .08 : 0;
    for(const area of ["farmhouse","general_store","cafe","workshop"]) {
      assert.equal(atmosphereLight(area,minute,sun).darkness,legacy);
      assert.equal(atmosphereLight(area,minute,sun).warmth,0);
    }
    assert.equal(atmosphereLight("mine_1",minute,sun).darkness,.18);
    assert(atmosphereLight("farm",minute,sun).darkness<=.281);
  }
});
test("every physical tool spends exactly its base cost on an empty/invalid swing", () => {
  for (const toolId of ["axe", "pickaxe", "hoe", "scythe", "water"] as const) {
    const { w, a, act, m } = fixture(); a.x = 16; a.y = 16; a.facing = "left";
    const before = JSON.stringify(w.entities), inventory = { ...m.inventory }, water = m.water;
    const r = act("useTool", { toolId });
    assert.equal(r.ok, false); assert.equal(r.fx?.tool, toolId); assert.equal(r.fx?.outcome, "fail");
    assert.equal(m.stamina, 100 - TOOL_STAMINA_COST[toolId]);
    assert.equal(JSON.stringify(w.entities), before); assert.deepEqual(m.inventory, inventory); assert.equal(m.water, water);
    assert.equal(w.revision, r.revision);
  }
});
test("valid watering, wet-soil repeat, empty can, road and object all cost one; only dry soil changes", () => {
  const { w, a, act, m } = fixture();
  const soil = entity("soil-farm-9-9", "farm", "soil", 304, 304, "tile_farm_empty"); w.entities[soil.id] = soil;
  assert(act("useTool", { toolId: "water" }).ok); assert(soil.watered); assert.equal(m.stamina, 99); assert.equal(m.water, 29);
  const quests = { ...m.quests };
  assert(!act("useTool", { toolId: "water" }).ok); assert.equal(m.stamina, 98); assert.equal(m.water, 29); assert.deepEqual(m.quests, quests);
  soil.watered = false; m.water = 0;
  assert(!act("useTool", { toolId: "water" }).ok); assert.equal(m.stamina, 97); assert(!soil.watered);
  delete w.entities[soil.id]; m.water = 12;
  const well = entity("well", "farm", "well", 304, 304, "stone_well"); w.entities.well = well;
  const poured = act("useTool", { toolId: "water", targetId: well.id });
  assert.equal(poured.fx?.action, "waterCrop"); assert.equal(m.stamina, 96); assert.equal(m.water, 12);
  assert(act("refill", { targetId: well.id }).ok); assert.equal(m.water, 30); assert.equal(m.stamina, 96);
  a.area = "farmhouse"; assert(!act("useTool", { toolId: "water" }).ok); assert.equal(m.stamina, 95);
});
test("successful hits and legacy commands use a single charge, preserving cheaper resource costs", () => {
  for (const [toolId, kind, asset, type, expected] of [
    ["axe", "tree", "tree_oak", "hitTree", 3], ["axe", "twig", "farm_twig_a", "clearTwig", 1],
    ["pickaxe", "rock", "farm_stone_a", "hitRock", 1], ["pickaxe", "rock", "mine_copper", "hitRock", 3],
    ["scythe", "gather", "farm_tall_grass", "cutGrass", 1],
  ] as const) for (const modern of [true, false]) {
    const { w, m, act } = fixture();
    const target = entity("resource", "farm", kind, 304, 304, asset); target.hp = 3; target.stage = 2;
    target.species = "tree_oak"; target.item = kind === "gather" ? "grass" : "wood"; w.entities[target.id] = target;
    const r = act(modern ? "useTool" : type, { toolId, targetId: target.id });
    assert(r.ok); assert.equal(m.stamina, 100 - expected);
  }
  const { act, m } = fixture(); assert(act("useTool", { toolId: "hoe" }).ok); assert.equal(m.stamina, 98);
  assert(!act("useTool", { toolId: "hoe" }).ok); assert.equal(m.stamina, 96);
});
test("authority rejects insufficient stamina, unowned tools and remote/forged actions before executing", () => {
  const { w, a, act, m } = fixture();
  const rock = entity("far-rock", "farm", "rock", 900, 900, "farm_stone_a"); w.entities[rock.id] = rock;
  assert.throws(() => act("useTool", { toolId: "axe", targetId: rock.id }), /가까이/); assert.equal(m.stamina, 100);
  assert.throws(() => act("useTool", { toolId: "water", tileX: 0, tileY: 0 }), /앞칸/); assert.equal(m.stamina, 100);
  delete m.inventory.axe; assert.throws(() => act("useTool", { toolId: "axe" }), /도구/);
  a.stamina = 0; assert.throws(() => act("useTool", { toolId: "water" }), /기력/); assert.equal(m.stamina, 100);
  assert.equal((parseCommand({ actionId: "forged01", type: "useTool", toolId: "water", stamina: 999, cost: 0 }) as any).stamina, undefined);
});
test("planting on watered soil, growth, harvesting and saved snapshots keep their existing contract", () => {
  const { w, act, m } = fixture(); act("tillTile"); act("waterCrop"); act("plantSeed", { itemId: "sproutberry_seed" });
  const crop = w.entities["soil-farm-9-9"]!; assert.equal(crop.stage, 0); assert(crop.watered);
  for (let i = 0; i < 3; i++) { crop.watered = true; nextDay(w); }
  assert.equal(crop.stage, 3); assert(act("harvestCrop").ok); assert.equal(m.stamina, 99);
  const loaded = JSON.parse(JSON.stringify(w)); upgradeWorld(loaded);
  assert.equal(loaded.entities[crop.id].kind, "soil"); assert.equal(loaded.members.a.inventory.sproutberry_seed, 11);
  assert.equal(Object.values(loaded.entities).filter((e: any) => e.kind === "drop" && e.item === "sproutberry").length, 1);
});
