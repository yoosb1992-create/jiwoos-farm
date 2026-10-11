import test from "node:test";
import assert from "node:assert/strict";
import { applyAction, nextDay, parseCommand } from "../shared/actions.js";
import { newWorld, newMember, entity, upgradeWorld, type Actor, type Command } from "../shared/world.js";
import { legacyLayout } from "../shared/layout.js";
import { currentLightLevel, seedGlowVisibility } from "../shared/sunlight.js";
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
  assert(glow(380) > 0 && glow(380) < glow(480));
  assert.equal(currentLightLevel({ minute: 720, exposure: 0 }), 0);
  assert.equal(currentLightLevel({ minute: 720, seasonalSunModifier: .6 }), .6);
  assert.equal(currentLightLevel({ minute: 720, sunlightIntensity: .5, exposure: .5 }), .25);
  assert.equal(currentLightLevel({ minute: 1080, profile: { sunset: 1050 } }), 0);
  assert.equal(currentLightLevel({ minute: 400, profile: { sunrise: 450 } }), 0);
  for (const season of ["spring", "summer", "autumn", "winter"] as const)
    assert.equal(currentLightLevel({ minute: 720, season }), 1, "future seasonal tuning is currently neutral");
  assert.equal(seedGlowVisibility(Number.NaN), 0);
  assert.deepEqual(Object.keys(CROP_VISUALS).sort(), Object.keys(CROPS).sort());
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
