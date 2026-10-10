import test from "node:test";
import assert from "node:assert/strict";
import { defaultLayout, legacyLayout, validateLayout } from "../shared/layout.js";
import { cell, terrainAt, placementAllowed, waterTerrain } from "../shared/world2.js";
import { collidesWithObstacle, isFarmable } from "../shared/applyMovement.js";
import { findPath } from "../shared/pathfinding.js";
import { insideWarp, safeSpawn } from "../shared/regions.js";
import { newWorld, newMember, upgradeWorld, type Actor } from "../shared/world.js";
import { applyAction } from "../shared/actions.js";
import { editorLayout, Journal } from "../client/editor/model.js";

test("sketched default farm: editable overgrown grass, four accessible lanes, safe collision and till rules", () => {
  const l = validateLayout(JSON.parse(JSON.stringify(defaultLayout()))), m = l.maps.farm!;
  assert.deepEqual([m.width, m.height], [128, 88]);
  assert.deepEqual(editorLayout().maps.farm, defaultLayout().maps.farm);
  assert.equal(m.farmAreas.length, 0);
  assert.equal(m.terrainRegions.length, 0);
  let farmable = 0;
  for (let y = 0; y < m.height; y++) for (let x = 0; x < m.width; x++) {
    const t = terrainAt(m, x, y);
    assert(!waterTerrain(t) && t !== "tilled_soil" && t !== "soil");
    if (isFarmable("farm", x, y, l.maps)) {
      farmable++;
      assert.equal(t, "grass");
      assert(placementAllowed(m, "building", x, y));
      assert(placementAllowed(m, "decoration", x, y));
      assert(!collidesWithObstacle((x + .5) * 32, (y + .5) * 32, "farm", l.maps));
    } else if (["stone_path", "dirt_path", "gravel"].includes(t)) {
      assert(!placementAllowed(m, "building", x, y));
      assert(!placementAllowed(m, "decoration", x, y));
    }
  }
  assert(farmable / (m.width * m.height) >= .60 && farmable / (m.width * m.height) <= .70);
  const spawn = safeSpawn("farm", "farm_entry", l.maps);
  assert.deepEqual(spawn, { x: 60.5 * 32, y: 37.5 * 32, facing: "down" });
  assert(!insideWarp(m, spawn.x, spawn.y));
  for (const [x, y] of [[64.5, 2.5], [64.5, 86.5], [2.5, 42.5], [125.5, 40.5], [36.5, 59.5], [97.5, 70.5], [76.5, 36.5]]) {
    const path = findPath("farm", spawn, p => Math.hypot(p.x - x! * 32, p.y - y! * 32) < 1, l.maps);
    assert(path?.length, `No path to ${x},${y}`);
  }
  for (const id of ["house", "water-well", m.objects.find(o => o.assetId.startsWith("tree") && !o.kind)!.id]) {
    const o = m.objects.find(o => o.id === id)!, c = o.collision!;
    assert(collidesWithObstacle(o.position.tileX * 32 + c.x + c.width / 2, o.position.tileY * 32 + c.y + c.height / 2, "farm", l.maps), id);
  }
  assert(collidesWithObstacle(10, 40 * 32, "farm", l.maps));
  assert.deepEqual(m.warps.map(w => [w.id, w.targetMapId, w.targetSpawnId]), legacyLayout().maps.farm!.warps.map(w => [w.id, w.targetMapId, w.targetSpawnId]));
  for (const s of m.spawns) assert(!insideWarp(m, ...[s.tileX * 32, s.tileY * 32] as [number, number]));
  const world = newWorld(9, l);
  assert(!Object.values(world.entities).some(e => e.area === "farm" && ["crop", "soil", "barn", "animal"].includes(e.kind)));
  world.members.a = newMember("a", "농부");
  const occupied = new Set(
    Object.values(world.entities)
      .filter(e => e.area === "farm")
      .map(e => `${Math.floor(e.x / 32)},${Math.floor(e.y / 32)}`),
  );
  let open: { x: number; y: number } | undefined;
  for (let y = 2; y < m.height - 1 && !open; y++)
    for (let x = 1; x < m.width - 1; x++)
      if (
        isFarmable("farm", x, y, l.maps) &&
        !occupied.has(`${x},${y}`) &&
        !occupied.has(`${x},${y - 1}`) &&
        !collidesWithObstacle((x + .5) * 32, (y - .5) * 32, "farm", l.maps)
      ) {
        open = { x, y };
        break;
      }
  assert(open, "Dense opening must still leave a clearable farmable tile");
  const a: Actor = {
    id: "a",
    area: "farm",
    x: (open.x + .5) * 32,
    y: (open.y - .5) * 32,
    facing: "down",
    running: false,
    stamina: 100,
  };
  const ctx = { now: 1, online: ["a"], votes: new Set<string>() };
  assert(applyAction(world, a, { actionId: "farm-till-1", type: "tillTile" }, ctx).ok);
  assert.equal(world.entities[`soil-farm-${open.x}-${open.y}`]!.kind, "soil");
  assert.throws(() => applyAction(world, { ...a, x: 64.5 * 32, y: 76.5 * 32 }, { actionId: "road-till-1", type: "tillTile" }, ctx));
  const j = new Journal(l), before = cell(m, "terrain", 36, 59);
  j.begin("edit default"); j.tile("farm", "terrain", 36, 59, 3); j.commit(); j.undo();
  assert.equal(cell(m, "terrain", 36, 59), before);
});

test("new default never upgrades saved family layouts, crops or progress into the new map", () => {
  const old = newWorld(42, legacyLayout());
  old.members.a = newMember("a", "기존 가족"); old.members.a.money = 876;
  const before = JSON.stringify(old);
  upgradeWorld(old);
  assert.equal(JSON.stringify(old), before);
  const noSnapshot = structuredClone(old); delete noSnapshot.layout;
  upgradeWorld(noSnapshot);
  assert.deepEqual(noSnapshot.layout, legacyLayout());
  assert.equal(noSnapshot.members.a!.money, 876);
  assert.equal(newWorld(43).layout!.maps.farm!.width, 128);
  assert.equal(old.layout!.maps.farm!.width, 52);
});
