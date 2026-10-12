import test from "node:test";
import assert from "node:assert/strict";
import { applyAction, parseCommand } from "../shared/actions.js";
import { newWorld, newMember, upgradeWorld, type Command, type Actor } from "../shared/world.js";
import { legacyLayout, validateLayout } from "../shared/layout.js";
import { canCraft, maxCrafts } from "../shared/household.js";
import { ITEMS, RECIPES } from "../shared/content.js";
import { collidesWithObstacle } from "../shared/applyMovement.js";
import { findPath } from "../shared/pathfinding.js";

function fixture() {
  const w = newWorld(42, legacyLayout());
  w.members.a = newMember("a", "A");
  const a: Actor = { id: "a", area: "farmhouse", x: 224, y: 272, facing: "up", running: false, stamina: 100 };
  const ctx = { now: Date.now(), online: ["a"], votes: new Set<string>() };
  const act = (type: string, more: Partial<Command> = {}) => applyAction(w, a,
    parseCommand({ actionId: crypto.randomUUID(), type, ...more }), ctx);
  return { w, a, ctx, act, m: w.members.a };
}
test("saved home furniture activates additively, retains collision and stays reachable", () => {
  const { w } = fixture();
  w.version = 7;
  w.chest = { wood: 217, stone: 8 };
  for (const o of w.layout!.maps.farmhouse!.objects) {
    delete o.kind;
    delete w.entities[o.id];
  }
  const before = structuredClone(w);
  upgradeWorld(w);
  assert.deepEqual(w.chest, before.chest);
  assert.deepEqual(w.members, before.members);
  assert.deepEqual(w.layout!.maps.farm, before.layout!.maps.farm);
  const bed = w.entities.bed!;
  assert.equal(bed.kind, "bed");
  assert.equal(w.entities.family_chest!.kind, "chest");
  assert.equal(w.entities.crafting_table!.kind, "craft");
  assert.ok(collidesWithObstacle(bed.x, bed.y, "farmhouse", w.layout!.maps));
  assert.ok(findPath("farmhouse", { x: 9 * 32, y: 10 * 32 },
    p => Math.hypot(p.x - bed.x, p.y - bed.y) <= 64, w.layout!.maps));
  assert.equal(validateLayout(w.layout).maps.farmhouse!.objects.find(o => o.id === "bed")!.kind, "bed");
  const upgraded = structuredClone(w);
  upgradeWorld(w);
  assert.deepEqual(w, upgraded);
});
test("a home missing its bed gets one without moving a warp, spawn or existing furniture", () => {
  const layout = legacyLayout(), home = layout.maps.farmhouse!;
  home.objects = home.objects.filter(o => o.assetId !== "bed");
  const before = structuredClone(home);
  const w = newWorld(1, layout), added = Object.values(w.entities).find(e => e.kind === "bed")!;
  assert.ok(added);
  assert.deepEqual(w.layout!.maps.farmhouse!.warps, before.warps);
  assert.deepEqual(w.layout!.maps.farmhouse!.spawns, before.spawns);
  assert.ok(findPath("farmhouse", { x: 9 * 32, y: 10 * 32 },
    p => Math.hypot(p.x - added.x, p.y - added.y) <= 64, w.layout!.maps));
});
test("one, rounded half and full chest transfers include stacks larger than 999", () => {
  const { w, a, m, act } = fixture();
  Object.assign(a, { x: 96, y: 170 });
  m.inventory.wood = 3001;
  act("depositChest", { targetId: "family_chest", itemId: "wood", quantity: 1 });
  act("depositChest", { targetId: "family_chest", itemId: "wood", quantityMode: "half" });
  assert.equal(m.inventory.wood, 1500);
  assert.equal(w.chest.wood, 1501);
  act("withdrawChest", { targetId: "family_chest", itemId: "wood", quantityMode: "half" });
  assert.equal(w.chest.wood, 750);
  act("withdrawChest", { targetId: "family_chest", itemId: "wood", quantityMode: "all" });
  assert.equal(m.inventory.wood, 3001);
  assert.equal(w.chest.wood, undefined);
  act("depositChest", { targetId: "family_chest", itemId: "wood", quantityMode: "all" });
  assert.equal(w.chest.wood, 3001);
  assert.equal(m.inventory.wood, undefined);
  assert.throws(() => act("depositChest", { targetId: "family_chest", itemId: "wood", quantityMode: "all" }));
});
test("full bag and stack overflow reject before either chest ledger changes", () => {
  const { w, a, m, act } = fixture();
  Object.assign(a, { x: 96, y: 170 });
  m.inventory = Object.fromEntries(Object.keys(ITEMS).filter(id => id !== "wood").slice(0, 48).map(id => [id, 1]));
  w.chest.wood = 10;
  const before = JSON.stringify([w.chest, m.inventory]);
  assert.throws(() => act("withdrawChest", { targetId: "family_chest", itemId: "wood", quantityMode: "all" }));
  assert.equal(JSON.stringify([w.chest, m.inventory]), before);
  m.inventory = { wood: 10 }; w.chest.wood = 999995;
  assert.throws(() => act("depositChest", { targetId: "family_chest", itemId: "wood", quantityMode: "all" }));
  assert.equal(m.inventory.wood, 10); assert.equal(w.chest.wood, 999995);
  for (const quantity of [-1, 0, 1.5, NaN, Infinity, 1000])
    assert.throws(() => act("depositChest", { targetId: "family_chest", itemId: "wood", quantity }));
  assert.throws(() => parseCommand({actionId:"bad-mode-id",type:"craftItem",quantityMode:"all"}));
});
test("batch crafting consumes exact costs, frees slots and rejects overflow atomically; upgrade remains intact", () => {
  const { a, m, act } = fixture();
  Object.assign(a, { x: 384, y: 256 });
  m.inventory.wood = 20;
  assert.equal(maxCrafts(m.inventory, RECIPES.wood_plank!), 10);
  act("craftItem", { targetId: "crafting_table", itemId: "wood_plank", quantity: 5 });
  assert.equal(m.inventory.wood, 10); assert.equal(m.inventory.wood_plank, 5);
  m.inventory.wood_plank = 999999;
  const before = structuredClone(m.inventory);
  assert.throws(() => act("craftItem", { targetId: "crafting_table", itemId: "wood_plank", quantity: 1 }));
  assert.deepEqual(m.inventory, before);
  m.inventory = Object.fromEntries(Object.keys(ITEMS).filter(id => !["wood", "wood_plank"].includes(id)).slice(0, 47).map(id => [id, 1]));
  m.inventory.wood = 10;
  assert.equal(canCraft(m.inventory, RECIPES.wood_plank!, 1), false);
  assert.equal(maxCrafts(m.inventory, RECIPES.wood_plank!), 5);
  act("craftItem", { targetId: "crafting_table", itemId: "wood_plank", quantity: 5 });
  assert.equal(Object.keys(m.inventory).length, 48);
  m.inventory = { wood: 5, copper_ore: 5 };
  act("upgradeTool", { targetId: "crafting_table" });
  assert.equal(m.toolLevel, 2); assert.deepEqual(m.inventory, {});
  assert.throws(() => act("upgradeTool", { targetId: "crafting_table" }));
});
test("bed requires farmhouse proximity; solo advances once, multiplayer waits, cancellation and stale day are safe", () => {
  const { w, a, ctx, act, m } = fixture();
  w.minute = 400; m.stamina = 30;
  Object.assign(a, { area: "farm" });
  assert.throws(() => act("sleepVote", { targetId: "bed", day: 1 }));
  Object.assign(a, { area: "farmhouse", x: 500 });
  assert.throws(() => act("sleepVote", { targetId: "bed", day: 1 }));
  Object.assign(a, { x: 224 });
  act("sleepVote", { targetId: "bed", day: 1 });
  assert.equal(w.day, 2); assert.equal(w.minute, 360); assert.equal(m.stamina, 100);
  assert.throws(() => act("sleepVote", { targetId: "bed", day: 1 }));
  w.members.b = newMember("b", "B"); ctx.online = ["a", "b"];
  act("sleepVote", { targetId: "bed", day: 2 }); assert.equal(w.day, 2);
  act("sleepVote", { value: false, day: 2 }); assert.equal(ctx.votes.size, 0);
  act("sleepVote", { targetId: "bed", day: 2 });
  a.id = "b"; act("sleepVote", { targetId: "bed", day: 2 });
  assert.equal(w.day, 3); assert.equal(ctx.votes.size, 0);
});
