import test from "node:test";
import assert from "node:assert/strict";
import { applyAction, parseCommand } from "../shared/actions.js";
import { newWorld, newMember, upgradeWorld, type Command, type Actor, entity } from "../shared/world.js";
import { legacyLayout, validateLayout } from "../shared/layout.js";
import { canCraft, maxCrafts } from "../shared/household.js";
import { chestInventory, chestStorageKey, migrateChestStorage } from "../shared/chest-storage.js";
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
  assert.deepEqual(chestInventory(w, "family_chest"), before.chest);
  assert.deepEqual(w.chest, {});
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
  assert.equal(chestInventory(w, "family_chest").wood, 1501);
  act("withdrawChest", { targetId: "family_chest", itemId: "wood", quantityMode: "half" });
  assert.equal(chestInventory(w, "family_chest").wood, 750);
  act("withdrawChest", { targetId: "family_chest", itemId: "wood", quantityMode: "all" });
  assert.equal(m.inventory.wood, 3001);
  assert.equal(chestInventory(w, "family_chest").wood, undefined);
  act("depositChest", { targetId: "family_chest", itemId: "wood", quantityMode: "all" });
  assert.equal(chestInventory(w, "family_chest").wood, 3001);
  assert.equal(m.inventory.wood, undefined);
  assert.throws(() => act("depositChest", { targetId: "family_chest", itemId: "wood", quantityMode: "all" }));
});
test("full bag and stack overflow reject before either chest ledger changes", () => {
  const { w, a, m, act } = fixture();
  Object.assign(a, { x: 96, y: 170 });
  m.inventory = Object.fromEntries(Object.keys(ITEMS).filter(id => id !== "wood").slice(0, 48).map(id => [id, 1]));
  chestInventory(w, "family_chest").wood = 10;
  const before = JSON.stringify([chestInventory(w, "family_chest"), m.inventory]);
  assert.throws(() => act("withdrawChest", { targetId: "family_chest", itemId: "wood", quantityMode: "all" }));
  assert.equal(JSON.stringify([chestInventory(w, "family_chest"), m.inventory]), before);
  m.inventory = { wood: 10 }; chestInventory(w, "family_chest").wood = 999995;
  assert.throws(() => act("depositChest", { targetId: "family_chest", itemId: "wood", quantityMode: "all" }));
  assert.equal(m.inventory.wood, 10); assert.equal(chestInventory(w, "family_chest").wood, 999995);
  for (const quantity of [-1, 0, 1.5, NaN, Infinity, 1000])
    assert.throws(() => act("depositChest", { targetId: "family_chest", itemId: "wood", quantity }));
  assert.throws(() => parseCommand({actionId:"bad-mode-id",type:"craftItem",quantityMode:"all"}));
});
test("legacy chest migration survives JSON reload and never copies stock to other chests", () => {
  const { w } = fixture();
  w.version = 8;
  delete w.chestStores;
  w.chest = { wood: 217, stone: 8 };
  upgradeWorld(w);
  assert.equal(w.legacyChestTarget, "family_chest");
  assert.deepEqual(chestInventory(w, "family_chest"), { wood: 217, stone: 8 });
  assert.deepEqual(chestInventory(w, "family-chest"), {});
  const restored = JSON.parse(JSON.stringify(w));
  upgradeWorld(restored);
  assert.deepEqual(restored, w);
  delete chestInventory(restored, "family_chest").wood;
  upgradeWorld(restored);
  assert.equal(chestInventory(restored, "family_chest").wood, undefined);
  assert.deepEqual(restored.chest, {});
});
test("migration retains legacy stock without a chest and never overwrites occupied stores", () => {
  const { w } = fixture();
  w.chest = { wood: 999999 };
  for (const e of Object.values(w.entities)) if (e.kind === "chest") delete w.entities[e.id];
  migrateChestStorage(w);
  assert.deepEqual(w.chest, { wood: 999999 });
  w.entities.a = entity("a", "farmhouse", "chest", 96, 160, "storage_chest");
  w.chestStores = { "chest:a": { stone: 9 } };
  migrateChestStorage(w);
  assert.deepEqual(w.chestStores["chest:a"], { stone: 9 });
  assert.equal(w.chest.wood, 999999);
  w.entities.b = entity("b", "farmhouse", "chest", 128, 160, "storage_chest");
  migrateChestStorage(w);
  assert.deepEqual(w.chestStores["chest:b"], { wood: 999999 });
  assert.deepEqual(w.chest, {});
  const saved = JSON.stringify(w.chestStores);
  delete w.entities.b;
  upgradeWorld(w);
  assert.equal(JSON.stringify(w.chestStores), saved);
});
test("individual chests isolate contents; only server bindings may share a future group", () => {
  const { w, a, m, act } = fixture();
  Object.assign(a, { x: 96, y: 170 });
  w.entities.second = entity("second", "farmhouse", "chest", 128, 160, "storage_chest");
  m.inventory.wood = 10;
  act("depositChest", { targetId: "family_chest", itemId: "wood", quantityMode: "half" });
  act("depositChest", { targetId: "second", itemId: "wood", quantityMode: "all" });
  act("withdrawChest", { targetId: "second", itemId: "wood", quantity: 1 });
  assert.equal(chestInventory(w, "family_chest").wood, 5);
  assert.equal(chestInventory(w, "second").wood, 4);
  assert.equal(m.inventory.wood, 1);
  Object.assign(a, { x: 600 });
  const before = JSON.stringify(w.chestStores);
  assert.throws(() => act("withdrawChest", { targetId: "second", itemId: "wood" }));
  assert.equal(JSON.stringify(w.chestStores), before);
  assert.equal(chestStorageKey("second"), "chest:second");
  // No shared chest is authored or enabled by this patch.
  w.chestBindings = { futureA: { mode: "shared", group: "fairy" }, futureB: { mode: "shared", group: "fairy" } };
  assert.equal(chestInventory(w, "futureA"), chestInventory(w, "futureB"));
  assert.notEqual(chestInventory(w, "futureA"), chestInventory(w, "second"));
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
