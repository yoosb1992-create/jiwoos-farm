import test from "node:test";
import assert from "node:assert/strict";
import { entity, newMember, newWorld, type Actor } from "../shared/world.js";
import { legacyLayout } from "../shared/layout.js";
import { newWorld2, setCell, terrainCode, ZONES } from "../shared/world2.js";
import { planPlacement } from "../shared/placement.js";
import { applyAction, parseCommand } from "../shared/actions.js";
import { chestInventory, chestInfos } from "../shared/chest-storage.js";
import { mergeChestGroup } from "../shared/chest-groups.js";
import { placementHints } from "../client/placement-preview.js";
import { receiveLayout } from "../client/layout.js";
import type { ColyseusAdapter, RenderPlayer } from "../client/network.js";

function fixture() {
  const w = newWorld(1, legacyLayout()); w.entities = {};
  const map = w.layout!.maps.farm!;
  Object.assign(map, { baseTileType: "grass", objects: [], collisionRegions: [], spawns: [], warps: [], world2: newWorld2() });
  const a: Actor = { id: "a", area: "farm", x: 336, y: 368, facing: "up", stamina: 100, running: false };
  w.members.a = newMember("a", "A"); w.members.a.inventory.storage_chest = 3;
  let now = Date.now();
  const act = (type: string, extra = {}) => applyAction(w, a, parseCommand({ actionId: crypto.randomUUID(), type, ...extra }), { now: now += 2000, online: ["a"], votes: new Set() });
  return { w, map, a, act };
}
test("bag placement allows ordinary ground outside building zones, including no-placement", () => {
  for (const terrain of ["grass", "soil", "sand", "gravel", "dirt_path", "stone_path", "stone"]) {
    const { w, map, a, act } = fixture();
    setCell(map, "terrain", 10, 10, terrainCode(terrain)); setCell(map, "zones", 10, 10, ZONES["no-placement"]);
    const saved = JSON.stringify(w), plan = planPlacement(w, a, "storage_chest", 10, 10);
    assert.equal(plan.error, undefined, terrain); assert.equal(JSON.stringify(w), saved);
    act("placeItem", { itemId: "storage_chest", tileX: 10, tileY: 10 });
    assert.equal(w.members.a!.inventory.storage_chest, 2);
    assert.equal(Object.values(w.entities).filter(e => e.kind === "chest").length, 1);
    assert.ok(planPlacement(w, a, "furnace", 11, 11).error, "machine policy remains restricted");
  }
});
test("water, cliffs, collision, nature, fixtures, players, entrances and bounds remain blocked", () => {
  for (const terrain of ["water", "shallow_water", "deep_water", "cliff"]) {
    const { w, map, a } = fixture(); setCell(map, "terrain", 10, 10, terrainCode(terrain));
    assert.ok(planPlacement(w, a, "storage_chest", 10, 10).error, terrain);
  }
  for (const kind of ["tree", "rock", "twig", "chest", "machine", "barn"] as const) {
    const { w, a } = fixture(); w.entities.block = entity("block", "farm", kind, 336, 336, "tree");
    assert.ok(planPlacement(w, a, "storage_chest", 10, 10).error, kind);
  }
  const { w, map, a } = fixture();
  assert.ok(planPlacement(w, a, "storage_chest", 10, 10, undefined, [{ area: "farm", x: 336, y: 336 }]).error);
  setCell(map, "collision", 10, 10, 1); assert.ok(planPlacement(w, a, "storage_chest", 10, 10).error);
  setCell(map, "collision", 10, 10, 0);
  map.warps = [{ id: "door", area: { startX: 10, endX: 10, startY: 9, endY: 9 }, targetMapId: "farmhouse", targetSpawnId: "entry" }];
  assert.match(planPlacement(w, a, "storage_chest", 10, 10).error!, /출입구/);
  map.warps = []; map.spawns = [{ id: "entry", tileX: 10, tileY: 10, facing: "down" }];
  assert.match(planPlacement(w, a, "storage_chest", 10, 10).error!, /출입구/);
  Object.assign(a, { x: 16, y: 16 }); assert.ok(planPlacement(w, a, "storage_chest", -1, 0).error);
});
test("all 1–3 carried cells are checked atomically; hints agree with actions and preserve stocks/groups", () => {
  for (const size of [1, 2, 3]) {
    const { w, map, a, act } = fixture();
    for (let i = 0; i < size; i++) w.entities[`c${i}`] = entity(`c${i}`, "farm", "chest", 336 + i * 32, 336, "storage_chest");
    if (size > 1) assert.equal(mergeChestGroup(w, Object.keys(w.entities)), undefined);
    chestInventory(w, "c0").wood = 5; act("liftChest", { targetId: "c0" }); Object.assign(a, { x: 656, y: 656 });
    const carried = w.members.a!.carried!, cells = planPlacement(w, a, "storage_chest", 20, 19, carried.entities).cells;
    const hint = () => {
      receiveLayout(JSON.stringify(w.layout));
      const me = { ...a, authoritativeX: a.x, authoritativeY: a.y, local: true } as RenderPlayer;
      return placementHints({ personal: { member: w.members.a, chestStores: w.chestStores, chestInfos: chestInfos(w) },
        state: { ...w, entities: new Map(Object.entries(w.entities)) }, snapshot: () => ({ players: [me] }) } as unknown as ColyseusAdapter, me)[0]!;
    };
    for (const c of cells) {
      const tx = Math.floor(c.x / 32), ty = Math.floor(c.y / 32); setCell(map, "water", tx, ty, terrainCode("deep_water"));
      const before = JSON.stringify(w); assert.ok(hint().error);
      assert.throws(() => act("lowerChest"), /물/); assert.equal(JSON.stringify(w), before); setCell(map, "water", tx, ty, 0);
    }
    assert.equal(hint().error, undefined); assert.deepEqual(hint().cells, cells); act("lowerChest");
    assert.equal(w.members.a!.carried, undefined); assert.equal(chestInventory(w, "c0").wood, 5);
    assert.equal(Object.values(w.entities).filter(e => e.kind === "chest").length, size);
    assert.deepEqual(Object.keys(w.entities).sort(), carried.entities.map(e => e.id).sort());
  }
});

test("portable chests use clear interior floors too; preview ignores disconnected occupants like the server", () => {
  const { w, map, a } = fixture();
  w.layout!.maps.farmhouse = { ...map, id: "farmhouse", baseTileType: "wood_floor" }; a.area = "farmhouse";
  assert.equal(planPlacement(w, a, "storage_chest", 10, 10).error, undefined);
  receiveLayout(JSON.stringify(w.layout));
  const me = { ...a, authoritativeX: a.x, authoritativeY: a.y, local: true, connected: true } as RenderPlayer;
  const other = { ...me, id: "b", local: false, connected: false, authoritativeX: 336, authoritativeY: 336 };
  const preview = (connected: boolean) => {
    other.connected = connected;
    return placementHints({ personal: { member: w.members.a }, state: { ...w, entities: new Map() },
      snapshot: () => ({ players: [me, other] }) } as unknown as ColyseusAdapter, me, "storage_chest")[0];
  };
  assert.equal(preview(false)!.error, undefined); assert.ok(preview(true)!.error);
});
