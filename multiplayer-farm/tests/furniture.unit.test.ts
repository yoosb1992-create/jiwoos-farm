import test from "node:test";
import assert from "node:assert/strict";
import { applyAction, parseCommand } from "../shared/actions.js";
import { entity, newMember, newWorld, upgradeWorld, generateDaily, type Actor, type Command } from "../shared/world.js";
import { legacyLayout } from "../shared/layout.js";
import { chestInfo, chestInventory } from "../shared/chest-storage.js";
import { mergeChestGroup } from "../shared/chest-groups.js";
import { planPlacement, adjacentCells } from "../shared/placement.js";
import { ITEMS } from "../shared/content.js";
import { toolLevel } from "../shared/tool-levels.js";
import { applyMovement, collidesWithObstacle } from "../shared/applyMovement.js";
function setup(size = 1) {
  const w = newWorld(10, legacyLayout()); w.entities = {};
  const farm = w.layout!.maps.farm!; farm.objects = []; farm.collisionRegions = []; delete farm.world2;
  const m = w.members.a = newMember("a", "A"); w.members.b = newMember("b", "B");
  const a: Actor = { id: "a", area: "farm", x: 336, y: 368, facing: "up", running: false, stamina: 100 };
  for (let i = 0; i < size; i++) w.entities[`c${i}`] = entity(`c${i}`, "farm", "chest", 336 + i * 32, 336, "storage_chest");
  if (size > 1) assert.equal(mergeChestGroup(w, Object.keys(w.entities)), undefined);
  let now = 10000;
  const act = (type: string, extra: Partial<Command> = {}, actor = a) => {
    now += 1000;
    return applyAction(w, actor, parseCommand({ actionId: crypto.randomUUID(), type, ...extra }), { now, online: ["a", "b"], votes: new Set() });
  };
  return { w, m, a, act };
}

test("legacy upgrades migrate once; axe and pickaxe costs/levels are independent and unsupported effects cannot consume materials", () => {
  const { w, m, a, act } = setup();
  delete m.toolLevels; m.toolLevel = 2; upgradeWorld(w);
  assert.equal(toolLevel(m, "axe"), 2); assert.equal(toolLevel(m, "pickaxe"), 2);
  const saved = JSON.stringify(m); upgradeWorld(w); assert.equal(JSON.stringify(m), saved);
  w.entities.craft = entity("craft", "farm", "craft", a.x, a.y, "crafting_table");
  m.toolLevels = { axe: 1, pickaxe: 1, hoe: 1 }; m.inventory.wood = 10; m.inventory.copper_ore = 10;
  act("upgradeTool", { targetId: "craft", itemId: "axe" });
  assert.equal(toolLevel(m, "axe"), 2); assert.equal(toolLevel(m, "pickaxe"), 1);
  const inventory = { ...m.inventory };
  assert.throws(() => act("upgradeTool", { targetId: "craft", itemId: "hoe" }), /준비 중/);
  assert.deepEqual(m.inventory, inventory);
});

test("all items have weight, chest mass includes every segment and hand lifting rejects overweight without mutation", () => {
  assert.ok(Object.values(ITEMS).every(i => Number.isFinite(i.weightKg) && i.weightKg! > 0));
  const { w, act } = setup(3);
  chestInventory(w, "c0").stone = 11;
  assert.equal(chestInfo(w, "c0").weightKg, 37.8);
  const saved = JSON.stringify(w);
  assert.throws(() => act("liftChest", { targetId: "c0" }), /무거워/);
  assert.equal(JSON.stringify(w), saved);
});

test("lift/lower 1–3 segments preserves identity, group metadata and stock across JSON reload; contested operations cannot duplicate", () => {
  for (const size of [1, 2, 3]) {
    const { w, m, a, act } = setup(size);
    chestInventory(w, "c0").wood = 8;
    const info = chestInfo(w, "c0"); w.chestSettings = { [info.storageKey]: { name: "재료함", color: "blue" } };
    const fx = act("liftChest", { targetId: "c0" }).transportFx;
    assert.equal(fx?.kind, "lift"); assert.equal(m.carried?.entities.length, size);
    assert.ok(info.members.every(id => !w.entities[id]));
    assert.throws(() => act("liftChest", { targetId: "c0" }, { ...a, id: "b" }), /대상이/);
    const restored = JSON.parse(JSON.stringify(w)); upgradeWorld(restored);
    assert.deepEqual(restored.members.a.carried, m.carried); assert.deepEqual(restored.chestStores, w.chestStores);
    generateDaily(w); assert.ok(info.members.every(id => !w.entities[id]));
    Object.assign(a, { x: 656, y: 656, facing: "up" });
    assert.equal(act("lowerChest").transportFx?.kind, "lower");
    assert.equal(m.carried, undefined); assert.equal(chestInfo(w, "c0").storageKey, info.storageKey);
    assert.equal(chestInfo(w, "c0").name, "재료함"); assert.equal(chestInventory(w, "c0").wood, 8);
    assert.equal(info.members.filter(id => w.entities[id]).length, size);
    assert.throws(() => act("lowerChest"), /들고 있는/);
  }
});

test("placement is orthogonal, checks the whole footprint, refuses a fourth segment and keeps failed carried merges atomic", () => {
  const { w, m, a, act } = setup(3);
  m.inventory.storage_chest = 2;
  assert.equal(adjacentCells(a).length, 4);
  for (const [x, y] of [[10, 11], [11, 10], [100, 100]]) assert.ok(planPlacement(w, a, "storage_chest", x!, y!).error);
  assert.ok(planPlacement(w, a, "sproutberry_seed", 10, 10).error);
  const original = JSON.stringify(w);
  Object.assign(a, { x: 432, y: 368 });
  assert.throws(() => act("placeItem", { itemId: "storage_chest", tileX: 13, tileY: 10 }), /최대 3칸/);
  assert.equal(JSON.stringify(w), original);
  Object.assign(a, { x: 336, y: 368 }); act("liftChest", { targetId: "c0" });
  Object.assign(a, { x: 656, y: 656 });
  w.entities.blocker = entity("blocker", "farm", "rock", 688, 624, "forest_rock");
  const before = JSON.stringify(w);
  assert.throws(() => act("lowerChest"), /물건/); assert.equal(JSON.stringify(w), before);
  delete w.entities.blocker;
  w.entities.fourth = entity("fourth", "farm", "chest", 720, 624, "storage_chest");
  const beforeMerge = JSON.stringify(w);
  assert.throws(() => act("lowerChest"), /최대 3칸/); assert.equal(JSON.stringify(w), beforeMerge);
});

test("pickaxe recovers only an empty chest group as drops once; authored furniture never respawns or leaves ghost collision", () => {
  const { w, a, act } = setup(2);
  w.layout!.maps.farm!.objects.push({ id: "c0", kind: "chest", assetId: "storage_chest", position: { tileX: 10.5, tileY: 10.5 } });
  chestInventory(w, "c0").wood = 1;
  const blocked = act("useTool", { toolId: "pickaxe", targetId: "c0" });
  assert.equal(blocked.ok, false); assert.ok(w.entities.c0);
  delete chestInventory(w, "c0").wood;
  const recovered = act("useTool", { toolId: "pickaxe", targetId: "c0" });
  assert.equal(recovered.fx?.outcome, "break"); assert.equal(recovered.fx?.drops.reduce((sum, d) => sum + d.quantity, 0), 2);
  const count = Object.values(w.entities).filter(e => e.kind === "drop").length;
  act("useTool", { toolId: "pickaxe", targetId: "c0" });
  assert.equal(Object.values(w.entities).filter(e => e.kind === "drop").length, count);
  assert.equal(collidesWithObstacle(336, 336, "farm", w.layout!.maps, Object.values(w.entities)), false);
  upgradeWorld(w); generateDaily(w); assert.equal(w.entities.c0, undefined);
  w.entities.house = entity("house", "farm", "barn", a.x, a.y - 32, "chicken_coop");
  assert.equal(act("useTool", { toolId: "pickaxe", targetId: "house" }).ok, false); assert.ok(w.entities.house);
});

test("carrying uses deterministic slower walking and cannot run", () => {
  const { w } = setup(); w.entities = {};
  const ordinary = { x: 656, y: 656, area: "farm", stamina: 100 };
  const carried = { ...ordinary, carrying: true, running: true };
  applyMovement(ordinary, { moveX: 1, moveY: 0, run: false }, 1/30, w.layout!.maps, []);
  applyMovement(carried, { moveX: 1, moveY: 0, run: true }, 1/30, w.layout!.maps, []);
  assert.ok(carried.x > 656 && carried.x < ordinary.x); assert.equal(carried.running, false); assert.equal(carried.stamina, 100);
});
