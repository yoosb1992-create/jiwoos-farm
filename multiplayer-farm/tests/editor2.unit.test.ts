import test from "node:test";
import assert from "node:assert/strict";
import { editorLayout, Journal } from "../client/editor/model.js";
import {
  cell,
  setCell,
  terrainCode,
  neighborMask,
  newWorld2,
} from "../shared/world2.js";
import { validateLayout } from "../shared/layout.js";
import {
  isFarmable,
  collidesWithObstacle,
  applyMovement,
} from "../shared/applyMovement.js";
import { fishingSpot } from "../shared/expansion.js";
import { newWorld, newMember } from "../shared/world.js";
import { applyAction } from "../shared/actions.js";

test("editor2 80,000 cells: schema roundtrip, compact 60-command history and chunk edges", () => {
  const l = editorLayout(),
    m = l.maps.farm!;
  m.width = 400;
  m.height = 200;
  m.world2 = newWorld2();
  m.objects = [];
  const j = new Journal(l);
  j.begin("80k fill");
  for (let y = 0; y < 200; y++)
    for (let x = 0; x < 400; x++)
      j.tile("farm", "terrain", x, y, terrainCode("sand"));
  j.commit();
  assert.equal(cell(m, "terrain", 399, 199), 5);
  assert.equal(Object.keys(m.world2.chunks).length, 325);
  assert.equal(JSON.stringify(validateLayout(l)).includes("chunkSize"), true);
  const command = j.undoStack[0]!;
  assert(command.changes.every((c) => c.type === "packed"));
  assert.equal(
    command.changes.reduce(
      (n, c) => n + (c.type === "packed" ? c.data.byteLength : 0),
      0,
    ),
    240000,
  );
  j.undo();
  assert.equal(cell(m, "terrain", 399, 199), 0);
  j.redo();
  assert.equal(cell(m, "terrain", 399, 199), 5);
  for (let i = 0; i < 59; i++) {
    j.begin("stroke");
    j.tile("farm", "water", i, 3, 13);
    j.commit();
  }
  assert.equal(j.undoStack.length, 60);
  for (let i = 0; i < 60; i++) j.undo();
  assert.equal(Object.keys(m.world2.chunks).length, 0);
  setCell(m, "water", 15, 15, 13);
  setCell(m, "water", 16, 15, 13);
  assert(neighborMask(m, 15, 15) & 2);
  assert(neighborMask(m, 16, 15) & 8);
  const bad = structuredClone(l);
  bad.maps.farm!.world2!.chunks["500,0"] = { layers: { terrain: { "0": 1 } } };
  assert.throws(() => validateLayout(bad));
});
test("authored water, bridge, farm/fishing/placement and events use shared authority", () => {
  const l = editorLayout(),
    m = l.maps.farm!;
  m.objects = [];
  m.world2 = newWorld2();
  setCell(m, "water", 10, 10, 13);
  assert(collidesWithObstacle(336, 336, "farm", l.maps));
  m.objects.push({
    id: "bridge",
    assetId: "bridge",
    position: { tileX: 10.5, tileY: 10.5 },
    bridge: true,
    width: 2,
    height: 3,
  }); // index may already be cached
  // Revalidate invalidates object identity and mirrors publish -> runtime loading.
  const valid = validateLayout(l),
    map = valid.maps.farm!;
  assert.equal(collidesWithObstacle(336, 336, "farm", valid.maps), false);
  setCell(map, "zones", 10, 10, 32);
  assert.equal(
    fishingSpot("farm", 9.5 * 32, 10.5 * 32, valid.maps)?.water,
    "pond",
  );
  setCell(map, "zones", 8, 8, 1);
  assert(isFarmable("farm", 8, 8, valid.maps));
  setCell(map, "elevation", 12, 10, 1);
  const p = { x: 11.5 * 32, y: 10.5 * 32, area: "farm" };
  for (let i = 0; i < 20; i++)
    applyMovement(p, { moveX: 1, moveY: 0 }, 0.03, valid.maps);
  assert(p.x < 12 * 32);
  setCell(map, "elevation", 12, 10, 3);
  for (let i = 0; i < 20; i++)
    applyMovement(p, { moveX: 1, moveY: 0 }, 0.03, valid.maps);
  assert(p.x > 12 * 32);
  map.world2!.events.push({
    id: "welcome",
    name: "환영",
    area: { startX: 4, endX: 5, startY: 4, endY: 5 },
    trigger: "enter",
    condition: "",
    once: true,
    action: "item",
    value: "wood",
    quantity: 2,
  });
  const w = newWorld(3, valid);
  w.members.a = newMember("a", "테스트");
  const a = {
    id: "a",
    area: "farm",
    x: 4.5 * 32,
    y: 4.5 * 32,
    facing: "down",
    running: false,
    stamina: 100,
  };
  applyAction(
    w,
    a,
    { actionId: "eventtest1", type: "worldEvent", targetId: "welcome" },
    { now: 1, online: ["a"], votes: new Set() },
  );
  assert.equal(w.members.a.inventory.wood, 2);
  assert.throws(() =>
    applyAction(
      w,
      a,
      { actionId: "eventtest2", type: "worldEvent", targetId: "welcome" },
      { now: 2, online: ["a"], votes: new Set() },
    ),
  );
});
