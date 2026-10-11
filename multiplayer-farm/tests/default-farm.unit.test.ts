import test from "node:test";
import assert from "node:assert/strict";
import { defaultLayout, legacyLayout, validateLayout } from "../shared/layout.js";
import { cell, terrainAt, placementAllowed, waterTerrain } from "../shared/world2.js";
import { applyMovement, collidesWithObstacle, isFarmable } from "../shared/applyMovement.js";
import { findPath } from "../shared/pathfinding.js";
import { insideWarp, safeSpawn } from "../shared/regions.js";
import { entity, newWorld, newMember, upgradeWorld, type Actor } from "../shared/world.js";
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
  const dynamicRock = entity("collision-rock", "farm", "rock", 80 * 32, 60 * 32, "farm_stone_a");
  const dynamicTwig = entity("collision-twig", "farm", "twig", 82 * 32, 60 * 32, "farm_twig_a");
  const dynamicTree = entity("collision-tree", "farm", "tree", 84 * 32, 60 * 32, "tree_oak_mature");
  const passableGrass = entity("collision-grass", "farm", "gather", 86 * 32, 60 * 32, "farm_tall_grass");
  for (const obstacle of [dynamicRock, dynamicTwig, dynamicTree])
    assert(collidesWithObstacle(obstacle.x, obstacle.y, "farm", l.maps, [obstacle]));
  assert(!collidesWithObstacle(passableGrass.x, passableGrass.y, "farm", l.maps, [passableGrass]));
  const walker = {
    x: dynamicRock.x,
    y: dynamicRock.y - 31,
    area: "farm",
    stamina: 100,
    facing: "down",
    moving: false,
    running: false,
    actionTicks: 0,
  };
  applyMovement(
    walker,
    { moveX: 0, moveY: 1, run: false },
    0.2,
    l.maps,
    [dynamicRock].values(),
  );
  assert(
    walker.y < dynamicRock.y - 20,
    "Vertical movement must not consume and bypass the dynamic obstacle iterator",
  );
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


test("solid natural scenery and editor debris share correct persistent/living collision", () => {
  const base = defaultLayout().maps.farm!;
  const at = 20.5 * 32;
  const make = (assetId: string, extra: Partial<(typeof base.objects)[number]> = {}) => {
    const authored = {
      id: "isolated-natural-object",
      assetId,
      position: { tileX: 20.5, tileY: 20.5 },
      ...extra,
    };
    const map = { ...base, world2: undefined, collisionRegions: [], objects: [authored] };
    return { maps: { farm: map } };
  };
  for (const assetId of [
    "tree_variant_a", "pond_rock_large", "green_shrub", "flowering_bush",
    "farm_twig_c", "farm_moss_stone", "farm_weed", "fence_horizontal",
  ]) {
    const { maps } = make(assetId);
    assert(
      collidesWithObstacle(at, at, "farm", maps),
      `Non-interactable ${assetId} must be solid without an authored collision box`,
    );
  }
  for (const assetId of ["flower_bed", "farm_short_grass", "farm_white_wildflower"]) {
    const { maps } = make(assetId);
    assert(!collidesWithObstacle(at, at, "farm", maps), `${assetId} remains walkable`);
  }
  const { maps } = make("farm_stone_a", {
    kind: "rock",
    collision: { x: -14, y: -10, width: 28, height: 20 },
  });
  assert(!collidesWithObstacle(at, at, "farm", maps, []),
    "Cleared authored debris must not leave invisible static collision");
  const live = entity("isolated-natural-object", "farm", "rock", at, at, "farm_stone_a");
  assert(collidesWithObstacle(at, at, "farm", maps, [live]),
    "Existing authored rock must still be solid");
  assert(!collidesWithObstacle(at + 100, at, "farm", maps, [live]),
    "Nearby paths must remain traversable");
});


test("nature occupancy blocks the whole tile: all four corners, stages and live clearing", () => {
  const base = defaultLayout().maps.farm!;
  const map = { ...base, world2: undefined, collisionRegions: [], objects: [] };
  const maps = { farm: map };
  const centerX = 20.5 * 32, centerY = 20.5 * 32;
  for (const [kind, asset, stage] of [
    ["tree", "tree_pine_seedling", 0], ["tree", "tree_oak_guardian", 4],
    ["stump", "stump", 0], ["rock", "farm_stone_b", 0],
    ["twig", "farm_thick_branch", 0], ["gather", "farm_weed_b", 0],
  ] as const) {
    const obstacle = entity("test-obstacle", "farm", kind, centerX, centerY, asset);
    obstacle.stage = stage;
    for (const px of [20 * 32 + 1, 21 * 32 - 1])
      for (const py of [20 * 32 + 1, 21 * 32 - 1])
        assert(collidesWithObstacle(px, py, "farm", maps, [obstacle]),
          `${kind} / ${asset} must block every tile corner`);
    for (const [px, py] of [
      [19.5 * 32, centerY], [21.5 * 32, centerY],
      [centerX, 19.5 * 32], [centerX, 21.5 * 32],
    ] as const)
      assert(!collidesWithObstacle(px, py, "farm", maps, [obstacle]),
        `Neighboring tile center should stay walkable around ${kind}`);
    assert(!collidesWithObstacle(centerX, centerY, "farm", maps, []),
      "Clearing an entity must immediately remove its tile collision");
  }
  const grass = entity("grass", "farm", "gather", centerX, centerY, "farm_tall_grass");
  assert(!collidesWithObstacle(centerX, centerY, "farm", maps, [grass]),
    "Soft grass stays walkable in an extremely dense opening");
});

test("occupied cells withstand joystick sprint, diagonal movement, pathfinding and static editor rocks", () => {
  const base = defaultLayout().maps.farm!;
  const map = { ...base, world2: undefined, collisionRegions: [], objects: [] as typeof base.objects };
  const maps = { farm: map };
  const rock = entity("test-rock", "farm", "rock", 20.5 * 32, 20.5 * 32, "farm_stone_a");
  for (const run of [false, true]) {
    const p = {
      x: 19.5 * 32, y: rock.y, area: "farm", stamina: 100,
      facing: "right", moving: false, running: false, actionTicks: 0,
    };
    for (let i = 0; i < 30; i++) {
      applyMovement(p, { moveX: 1, moveY: 0, run }, 1 / 30, maps, [rock].values());
      assert.equal(Math.floor(p.x / 32), 19, "The obstructed tile cannot be entered");
    }
  }
  const diagonal = {
    x: 19.5 * 32, y: 19.5 * 32, area: "farm", stamina: 100,
    facing: "down", moving: false, running: false, actionTicks: 0,
  };
  for (let i = 0; i < 35; i++) {
    applyMovement(diagonal, { moveX: 1, moveY: 1, run: true }, 1 / 30, maps, [rock].values());
    assert(!collidesWithObstacle(diagonal.x, diagonal.y, "farm", maps, [rock]),
      "Diagonally moving into an obstructed cell must never be possible");
  }
  const path = findPath("farm", { x: 19.5 * 32, y: rock.y },
    p => Math.floor(p.x / 32) === 21 && Math.floor(p.y / 32) === 20, maps, [rock]);
  assert(path?.length, "Touch-navigation must route around a blocked cell");
  assert(path.every(p => !(Math.floor(p.x / 32) === 20 && Math.floor(p.y / 32) === 20)));
  const authored = {
    id: "static-natural-rock", assetId: "pond_rock_large",
    position: { tileX: 20.5, tileY: 20.5 },
    collision: { x: -6, y: -5, width: 12, height: 10 },
  };
  map.objects = [authored];
  for (const px of [20 * 32 + 1, 21 * 32 - 1])
    for (const py of [20 * 32 + 1, 21 * 32 - 1])
      assert(collidesWithObstacle(px, py, "farm", maps, []),
        "Editor scenery must block its full grid cell regardless of its small custom box");
  assert(!collidesWithObstacle(19.5 * 32, rock.y, "farm", maps, []));
  map.objects = [{ ...authored, kind: "rock" }];
  assert(!collidesWithObstacle(rock.x, rock.y, "farm", maps, []),
    "Cleared interactive authored rock must leave no phantom collision");
});


test("safeSpawn avoids a live natural obstacle placed by a saved world editor layout", () => {
  const l = defaultLayout();
  const spawn = l.maps.farm!.spawns.find(p => p.id === "farm_entry")!;
  const obstacle = entity("spawn-tree", "farm", "tree", spawn.tileX * 32, spawn.tileY * 32, "tree_pine_mature");
  assert(collidesWithObstacle(obstacle.x, obstacle.y, "farm", l.maps, [obstacle]));
  const safe = safeSpawn("farm", "farm_entry", l.maps, true, [obstacle].values());
  assert(!collidesWithObstacle(safe.x, safe.y, "farm", l.maps, [obstacle]));
  assert.notDeepEqual([safe.x, safe.y], [obstacle.x, obstacle.y]);
});
