import test from "node:test";
import assert from "node:assert/strict";
import { newWorld, newMember, entity } from "../shared/world.js";
import { defaultLayout } from "../shared/layout.js";
import { prepareLayout } from "../shared/world-templates.js";
import { reviewLayout } from "../shared/layout-application.js";
import { setCell, terrainCode } from "../shared/world2.js";
import { isFarmable } from "../shared/applyMovement.js";

test("unchanged current layout is safe; changed stateful fixtures, water, fields and player positions are protected", () => {
  const w = newWorld(9, prepareLayout(defaultLayout()));
  assert.equal(reviewLayout(w, w.layout).review.conflicts.length, 0);
  const chest = Object.values(w.entities).find((e) => e.kind === "chest")!;
  const moved = structuredClone(w.layout!);
  moved.maps[chest.area]!.objects.find(
    (o) => o.id === chest.id,
  )!.position.tileX += 1;
  assert.ok(
    reviewLayout(w, moved).review.conflicts.some((c) => c.id === chest.id),
  );
  const m = (w.members.p = newMember("p", "농부"));
  m.position = { area: "farm", x: 60.5 * 32, y: 37.5 * 32, facing: "down" };
  const water = structuredClone(w.layout!);
  setCell(water.maps.farm!, "water", 60, 37, terrainCode("water"));
  assert.ok(
    reviewLayout(w, water).review.conflicts.some((c) => c.id === "농부"),
  );
  let x = 20,
    y = 20;
  while (!isFarmable("farm", x, y, w.layout!.maps)) {
    if (++x >= 100) {
      x = 20;
      y++;
    }
  }
  w.entities.field = entity(
    "field",
    "farm",
    "crop",
    (x + 0.5) * 32,
    (y + 0.5) * 32,
    "",
  );
  w.entities.field.crop = "sproutberry";
  const path = structuredClone(w.layout!);
  setCell(path.maps.farm!, "terrain", x, y, terrainCode("stone_path"));
  assert.ok(
    reviewLayout(w, path).review.conflicts.some((c) => c.id === "field"),
  );
  const prior = JSON.stringify(w);
  reviewLayout(w, path);
  assert.equal(JSON.stringify(w), prior);
});
