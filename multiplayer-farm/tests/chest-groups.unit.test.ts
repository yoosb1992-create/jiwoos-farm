import test from "node:test";
import assert from "node:assert/strict";
import { applyAction, parseCommand } from "../shared/actions.js";
import { ITEMS } from "../shared/content.js";
import { legacyLayout } from "../shared/layout.js";
import { entity, newWorld, newMember, upgradeWorld, type Actor, type Command } from "../shared/world.js";
import { chestInfo, chestInventory, chestStorageKeys } from "../shared/chest-storage.js";
import { initializeChestGroups, mergeChestGroup } from "../shared/chest-groups.js";
import { collidesWithObstacle } from "../shared/applyMovement.js";

function fixture(count = 3) {
  const w = newWorld(42, legacyLayout()); w.entities = {}; w.nextEntity = 0;
  for (let i = 0; i < count; i++) w.entities[`c${i}`] = entity(`c${i}`, "farm", "chest", 320 + i * 32, 320, "storage_chest");
  const m = w.members.a = newMember("a", "A");
  const actor: Actor = { id: "a", area: "farm", x: 352, y: 350, facing: "up", running: false, stamina: 100 };
  const act = (type: string, extra: Partial<Command> = {}) => applyAction(w, actor,
    parseCommand({ actionId: crypto.randomUUID(), type, targetId: "c0", ...extra }), { now: Date.now(), online: ["a"], votes: new Set() });
  return { w, m, actor, act };
}
const itemIds = Object.values(ITEMS).filter(i => i.kind !== "tool" && i.id !== "wood").map(i => i.id);

test("settings validate input, honor proximity, persist names/colors and use size-based defaults", () => {
  const { w, actor, act } = fixture();
  assert.equal(chestInfo(w, "c0").name, "작은 보관함");
  act("configureChest", { chestName: "  씨앗 보관함  ", chestColor: "green" });
  act("linkChest");
  assert.equal(chestInfo(w, "c2").name, "씨앗 보관함");
  assert.equal(chestInfo(w, "c2").color, "green");
  const restored = JSON.parse(JSON.stringify(w)); upgradeWorld(restored);
  assert.deepEqual(chestInfo(restored, "c1"), chestInfo(w, "c1"));
  for (const chestName of ["가".repeat(21), "bad\nname", "<script>", "숨김\u202e"]) assert.throws(() => act("configureChest", { chestName, chestColor: "wood" }));
  assert.throws(() => act("configureChest", { chestName: "ok", chestColor: "#ffffff" }));
  actor.x += 1000;
  assert.throws(() => act("configureChest", { chestName: "몰래 변경", chestColor: "red" }));
  assert.equal(chestInfo(w, "c0").name, "씨앗 보관함");
  actor.x -= 1000;
  act("configureChest", { chestName: "", chestColor: "wood" });
  assert.equal(chestInfo(w, "c0").name, "대형 보관함");
});

test("1/2/3 chests enforce 16/32/48 distinct slots while retaining legacy overflow and existing stacks", () => {
  for (const size of [1, 2, 3]) {
    const { w, m, act } = fixture(size);
    if (size > 1) act("linkChest");
    const info = chestInfo(w, "c0"), inv = chestInventory(w, "c0");
    assert.equal(info.capacity, size * 16);
    for (const id of itemIds.slice(0, info.capacity)) inv[id] = 1;
    m.inventory = { wood: 10, [itemIds[0]!]: 10 };
    assert.throws(() => act("depositChest", { itemId: "wood", quantityMode: "all" }), /가득/);
    act("depositChest", { itemId: itemIds[0], quantityMode: "all" });
    assert.equal(inv[itemIds[0]!], 11);
    // Saved over-capacity stock is readable and withdrawable, never truncated.
    inv[itemIds[info.capacity]!] = 7;
    const saved = structuredClone(inv); upgradeWorld(w);
    assert.deepEqual(chestInventory(w, "c0"), saved);
    act("withdrawChest", { itemId: itemIds[info.capacity], quantityMode: "all" });
    assert.equal(m.inventory[itemIds[info.capacity]!], 7);
    assert.equal(m.inventory.wood, 10);
  }
});

test("one-time migration merges legacy plus individual stores once, partitions four horizontally and ignores vertical neighbors", () => {
  const { w } = fixture(4);
  w.entities.vertical = entity("vertical", "farm", "chest", 320, 352, "storage_chest");
  w.chestStores = { "chest:c0": { wood: 7 }, "chest:c1": { wood: 9 }, "chest:c3": { stone: 4 } };
  w.chest = { stone: 11 }; delete w.chestGroupsVersion;
  w.version = 9; upgradeWorld(w);
  assert.deepEqual(chestInventory(w, "c0"), { wood: 16, stone: 11 });
  assert.equal(chestInventory(w, "c0"), chestInventory(w, "c2"));
  assert.deepEqual(chestInventory(w, "c3"), { stone: 4 });
  assert.deepEqual(chestInventory(w, "vertical"), {});
  const saved = JSON.stringify(w); const restored = JSON.parse(saved); upgradeWorld(restored);
  assert.equal(JSON.stringify(restored), saved);
  assert.deepEqual(w.chest, {});
  assert.deepEqual(w.chestStores!["chest:c1"], {});
});

test("unsafe merges are atomic, four-way/vertical links fail, and a group key survives growth on its left", () => {
  const { w, act } = fixture(2);
  chestInventory(w, "c0").wood = 999999; chestInventory(w, "c1").wood = 1;
  const before = JSON.stringify(w);
  assert.throws(() => act("linkChest"), /수량 한도/);
  assert.equal(JSON.stringify(w), before);
  delete w.chestGroupsVersion; initializeChestGroups(w);
  assert.equal(chestInventory(w, "c0").wood, 999999);
  chestInventory(w, "c0").wood = 10;
  act("linkChest");
  const key = chestInfo(w, "c0").storageKey;
  w.entities.left = entity("left", "farm", "chest", 288, 320, "storage_chest");
  act("linkChest");
  assert.equal(chestInfo(w, "left").storageKey, key);
  assert.equal(chestInventory(w, "left").wood, 11);
  w.entities.fourth = entity("fourth", "farm", "chest", 384, 320, "storage_chest");
  assert.throws(() => act("linkChest"), /최대 3칸/);
  w.entities.below = entity("below", "farm", "chest", 320, 352, "storage_chest");
  assert.match(mergeChestGroup(w, ["c0", "below"])!, /가로/);
});

test("over-capacity merging preserves all sources, empty splitting never copies stock or reconnects on reload", () => {
  const { w, act } = fixture(2);
  Object.assign(chestInventory(w, "c0"), Object.fromEntries(itemIds.slice(0, 33).map(id => [id, 1])));
  const before = structuredClone(w.chestStores);
  assert.throws(() => act("linkChest"), /용량/); assert.deepEqual(w.chestStores, before);
  w.chestStores = { "chest:c0": { wood: 3 }, "chest:c1": { wood: 4 } };
  act("linkChest");
  assert.throws(() => act("unlinkChest"), /모두 꺼낸/);
  act("withdrawChest", { targetId: "c1", itemId: "wood", quantityMode: "all" });
  act("unlinkChest");
  const saved = structuredClone(w); upgradeWorld(w); assert.deepEqual(w, saved);
  assert.notEqual(chestStorageKeys(w).c0, chestStorageKeys(w).c1);
  assert.deepEqual(chestInventory(w, "c0"), {}); assert.deepEqual(chestInventory(w, "c1"), {});
});

test("bag placement snaps to an authored chest, consumes one item, and connects a physical three-tile chest", () => {
  const { w, m, actor, act } = fixture(1);
  const farm = w.layout!.maps.farm!; farm.objects = []; farm.collisionRegions = []; delete farm.world2;
  w.chestStores = { "chest:c0": { wood: 5 } }; w.chest = { stone: 11 };
  m.inventory.storage_chest = 3;
  Object.assign(actor, { x: 352, y: 368 });
  act("placeChest");
  assert.equal(chestInfo(w, "c0").size, 2);
  assert.deepEqual(chestInventory(w, "c0"), { wood: 5, stone: 11 });
  assert.deepEqual(w.chest, {});
  Object.assign(actor, { x: 384, y: 368 }); act("placeChest");
  assert.equal(chestInfo(w, "c0").size, 3);
  Object.assign(actor, { x: 416, y: 368 }); assert.throws(() => act("placeChest"), /최대 3칸/);
  assert.equal(m.inventory.storage_chest, 1);
  assert.equal(chestInfo(w, "c0").capacity, 48);
  assert.equal(w.entities["chest-3"], undefined);
  assert.ok(collidesWithObstacle(384, 320, "farm", w.layout!.maps, Object.values(w.entities)));
});
