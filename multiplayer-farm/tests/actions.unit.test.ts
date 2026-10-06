import test from "node:test";
import assert from "node:assert/strict";
import { applyAction, parseCommand, nextDay } from "../shared/actions.js";
import {
  newWorld,
  newMember,
  entity,
  addDrop,
  type Actor,
  type World,
  type Command,
} from "../shared/world.js";
import { applyMovement } from "../shared/applyMovement.js";
import { hashPassword, verifyPassword } from "../persistence/store.js";
let seq = 0;
function setup() {
  const w = newWorld(42);
  w.members.a = newMember("a", "A");
  w.members.b = newMember("b", "B");
  const a: Actor = {
    id: "a",
    area: "farm",
    x: 304,
    y: 272,
    facing: "down",
    running: false,
    stamina: 100,
  };
  return { w, a };
}
function act(w: World, a: Actor, type: string, more: Partial<Command> = {}) {
  return applyAction(
    w,
    a,
    { actionId: `action_${++seq}`, type, ...more },
    { now: Date.now(), online: ["a", "b"], votes: new Set() },
  );
}
test("25. snapshot JSON round-trip preserves durable world and all members", () => {
  const { w } = setup();
  assert.deepEqual(JSON.parse(JSON.stringify(w)), w);
});
test("movement: normalized diagonals, boundaries, shared collision and run stamina", () => {
  const p = { x: 400, y: 400, area: "farm", stamina: 100 },
    q = { ...p },
    r = { ...p };
  applyMovement(p, { moveX: 1, moveY: 0 }, 0.1);
  applyMovement(q, { moveX: 1, moveY: 1 }, 0.1);
  assert.ok(Math.abs(Math.hypot(q.x - 400, q.y - 400) - (p.x - 400)) < 0.001);
  applyMovement(r, { moveX: 1, moveY: 0, run: true }, 0.1);
  assert.ok(r.x > p.x && r.stamina < 100);
  for (let i = 0; i < 1000; i++)
    applyMovement(r, { moveX: 999, moveY: NaN, run: "yes" }, 1 / 30);
  assert.ok(Number.isFinite(r.x) && r.x < 1664);
});
test("6/7/8 farming, watering and harvest only once", () => {
  const { w, a } = setup();
  act(w, a, "tillTile");
  act(w, a, "plantSeed", { itemId: "sproutberry_seed" });
  const crop = w.entities["soil-farm-9-9"]!;
  assert.equal(crop.kind, "crop");
  for (let d = 0; d < 3; d++) {
    if (!crop.watered) act(w, a, "waterCrop");
    nextDay(w);
  }
  assert.equal(crop.stage, 3);
  act(w, a, "harvestCrop");
  assert.throws(() => act(w, a, "harvestCrop"));
  assert.equal(
    Object.values(w.entities).filter((e) => e.item === "sproutberry").length,
    1,
  );
});
test("9/10 two actors hit one tree: exactly one felling reward, separate stump", () => {
  const { w, a } = setup();
  const tree = w.entities["starter-pine"]!;
  a.x = tree.x;
  a.y = tree.y - 32;
  a.facing = "down";
  for (const id of ["a", "b", "a"])
    act(w, { ...a, id }, "hitTree", { targetId: tree.id });
  assert.equal(tree.kind, "stump");
  assert.equal(tree.hp, 3);
  assert.deepEqual(
    Object.values(w.entities)
      .filter((e) => e.kind === "drop")
      .map((e) => e.item)
      .sort(),
    ["pine_cone", "pine_needles", "wood"],
  );
});
test("11 contested drop pickup cannot duplicate", () => {
  const { w, a } = setup();
  const d = addDrop(w, a, "wood", 1);
  act(w, a, "pickupDrop", { targetId: d.id });
  assert.throws(() =>
    act(w, { ...a, id: "b" }, "pickupDrop", { targetId: d.id }),
  );
  assert.equal(w.members.a!.inventory.wood, 1);
  assert.equal(w.members.b!.inventory.wood, undefined);
});
test("12 contested chest withdrawal cannot duplicate", () => {
  const { w, a } = setup();
  const c = w.entities["family-chest"]!;
  a.x = c.x;
  a.y = c.y;
  w.chest.wood = 1;
  act(w, a, "withdrawChest", { targetId: c.id, itemId: "wood" });
  assert.throws(() =>
    act(w, { ...a, id: "b" }, "withdrawChest", {
      targetId: c.id,
      itemId: "wood",
    }),
  );
  assert.equal(w.members.a!.inventory.wood, 1);
  assert.equal(w.chest.wood, undefined);
});
test("13/14 crafting verifies every ingredient before changing any stack", () => {
  const { w, a } = setup();
  const t = w.entities["crafting-table"]!;
  a.x = t.x;
  a.y = t.y;
  assert.throws(() =>
    act(w, a, "craftItem", { targetId: t.id, itemId: "fairy_thread" }),
  );
  w.members.a!.inventory.wild_herb = 2;
  assert.throws(() =>
    act(w, a, "craftItem", { targetId: t.id, itemId: "fairy_thread" }),
  );
  assert.equal(w.members.a!.inventory.wild_herb, 2);
  w.members.a!.inventory.fairy_bloom = 1;
  act(w, a, "craftItem", { targetId: t.id, itemId: "fairy_thread" });
  assert.equal(w.members.a!.inventory.fairy_thread, 1);
  assert.throws(() =>
    act(w, a, "craftItem", { targetId: t.id, itemId: "fairy_thread" }),
  );
});
test("15/16 stamina, front target, range and run seeding reject invalid actions", () => {
  const { w, a } = setup();
  assert.throws(() => act(w, { ...a, stamina: 0 }, "tillTile"));
  w.members.a!.stamina = 100;
  assert.throws(() => act(w, a, "tillTile", { tileX: 18, tileY: 14 }));
  act(w, a, "tillTile");
  assert.throws(() =>
    act(w, { ...a, running: true }, "plantSeed", {
      itemId: "sproutberry_seed",
    }),
  );
  assert.equal(w.members.a!.inventory.sproutberry_seed, 12);
  assert.throws(() =>
    act(w, a, "hitTree", { targetId: "farm_tree_far_east_north" }),
  );
});
test("17/18 parser ignores state injection and rejects malformed payloads", () => {
  assert.deepEqual(
    parseCommand({
      actionId: "12345678",
      type: "eat",
      inventory: { wood: 999 },
      x: 123,
      crop: { stage: 9 },
    }),
    { actionId: "12345678", type: "eat" },
  );
  for (const v of [
    null,
    { actionId: "12345678", type: "inventory" },
    { actionId: "12345678", type: "plantSeed", tileX: NaN },
    { actionId: "12345678", type: "withdrawChest", quantity: 1.5 },
  ])
    assert.throws(() => parseCommand(v));
});
test("19/20/21 all online votes advance shared day and reset deterministic forest", () => {
  const { w, a } = setup();
  const votes = new Set<string>(),
    ctx = { now: 0, online: ["a", "b"], votes };
  const ids = Object.keys(w.entities).filter((id) => id.startsWith("forest"));
  applyAction(w, a, { actionId: "vote-a-01", type: "sleepVote" }, ctx);
  assert.equal(w.day, 1);
  applyAction(
    w,
    { ...a, id: "b" },
    { actionId: "vote-b-01", type: "sleepVote" },
    ctx,
  );
  assert.equal(w.day, 2);
  assert.ok(ids.every((id) => !w.entities[id]));
  assert.ok(Object.keys(w.entities).some((id) => id.startsWith("forest-2")));
  assert.equal(votes.size, 0);
});
test("22/23 mining drops once and validates ladder before unlocking floor", () => {
  const { w, a } = setup();
  a.area = "mine1";
  const rock = Object.values(w.entities).find(
    (e) => e.area === "mine1" && e.kind === "rock",
  )!;
  a.x = rock.x;
  a.y = rock.y - 32;
  act(w, a, "hitRock", { targetId: rock.id });
  act(w, { ...a, id: "b" }, "hitRock", { targetId: rock.id });
  assert.throws(() => act(w, a, "hitRock", { targetId: rock.id }));
  assert.equal(
    Object.values(w.entities).filter(
      (e) => e.area === "mine1" && e.kind === "drop",
    ).length,
    1,
  );
  const result = act(w, a, "mineAction", { targetId: "ladder-mine1" });
  assert.equal(w.deepest, 2);
  assert.equal(result.transition?.area, "mine2");
});
test("machines: inputs consumed once, server world time controls collection", () => {
  const { w, a } = setup();
  w.members.a!.inventory.wood = 4;
  const machine = entity(
    "machine",
    "farm",
    "machine",
    a.x,
    a.y,
    "wood_processor",
  );
  w.entities.machine = machine;
  act(w, a, "startMachine", { targetId: "machine" });
  assert.throws(() => act(w, a, "collectMachine", { targetId: "machine" }));
  w.minute += 120;
  act(w, a, "collectMachine", { targetId: "machine" });
  assert.equal(w.members.a!.inventory.wood_plank, 1);
  assert.throws(() => act(w, a, "collectMachine", { targetId: "machine" }));
});
test("fishing: validates bite, elapsed time, hold replay and a single reward", () => {
  const { w, a } = setup();
  a.x = 26 * TILE;
  a.y = 14 * TILE;
  const ctx = (now: number) => ({
    now,
    online: ["a"],
    votes: new Set<string>(),
  });
  const result = applyAction(
    w,
    a,
    { actionId: "fishing-001", type: "castFishing" },
    ctx(100),
  );
  const challenge = result.fishing!;
  assert.ok(challenge);
  const hook = {
    actionId: "fishing-002",
    type: "hookFishing",
    targetId: challenge.id,
  };
  assert.throws(() => applyAction(w, a, hook, ctx(500)));
  applyAction(w, a, hook, ctx(challenge.biteAt + 100));
  const frame = newFishingFrame(),
    inputs: number[] = [];
  while (!frame.done) {
    const target = fishPosition(
      challenge.seed,
      challenge.difficulty,
      frame.tick + 4,
    );
    const held = target > frame.cursor + frame.velocity * 0.16;
    inputs.push(Number(held));
    fishingStep(frame, held, challenge.seed, challenge.difficulty);
  }
  assert.ok(frame.won);
  const finish = {
    actionId: "fishing-003",
    type: "fishingResult",
    targetId: challenge.id,
    inputs,
  };
  assert.throws(() => applyAction(w, a, finish, ctx(challenge.biteAt + 200)));
  const now = challenge.biteAt + 100 + inputs.length * FISH_STEP_MS;
  applyAction(w, a, finish, ctx(now));
  assert.equal(w.members.a!.inventory[challenge.fishId], 1);
  assert.equal(w.members.a!.fishBook?.[challenge.fishId]?.count, 1);
  assert.throws(() => applyAction(w, a, finish, ctx(now + 100)));
});
import {
  fishPosition,
  fishingStep,
  newFishingFrame,
  FISH_STEP_MS,
} from "../shared/fishing.js";
import { TILE } from "../shared/content.js";
test("passwords: salted scrypt supports short and long passwords without plaintext", async () => {
  for (const password of ["지우", "x".repeat(512)]) {
    const h = await hashPassword(password);
    assert.notEqual(h, password);
    assert.ok(await verifyPassword(password, h));
    assert.equal(await verifyPassword("wrong", h), false);
  }
});
