import { strict as assert } from "node:assert";
import { Inventory, normalizeSaveData } from "../domain";
import { generateFairyForest } from "../forest/generation";
import { installFairyForest } from "../forest/registry";
import { emptyForestState, findForestResource, FOREST_RESOURCES, generateResourceForest, herbObjects, normalizeForestState, resourceKind, strikeForestNode } from "../forest/resources";
import { MapRegistry } from "../maps/MapRegistry";

const registry = new MapRegistry();
installFairyForest(registry, "single", 4);
const forest = registry.require("fairy_forest");
const original = generateFairyForest("single", 4);
const originalNodes = [...original.objects, ...herbObjects(original, "single", 4)];
assert.deepEqual(forest.objects.slice(0, originalNodes.length), originalNodes, "rare resources preserve original tree, rock and herb layout, IDs and order");
assert.ok(forest.objects.some(o => o.assetId === "forest_herb"));
const same = new MapRegistry(); installFairyForest(same, "single", 4);
assert.deepEqual(same.require("fairy_forest").objects, forest.objects, "same day produces identical resource node IDs and positions");
const next = new MapRegistry(); installFairyForest(next, "single", 5);
assert.notDeepEqual(next.require("fairy_forest").objects, forest.objects, "new day regenerates nodes");
for (const [kind, min, max] of [["moon_mushroom", 2, 5], ["fairy_bloom", 1, 3]] as const) {
  const rare = forest.objects.filter(o => resourceKind(o) === kind);
  assert.ok(rare.length >= min && rare.length <= max, `${kind} daily spawn limit`);
  assert.deepEqual(rare, generateResourceForest("single", 4).objects.filter(o => resourceKind(o) === kind), "identical scope/day yields same rare positions and IDs");
  assert.notDeepEqual(rare, generateResourceForest("single", 5).objects.filter(o => resourceKind(o) === kind), "new day changes rare positions");
  assert.equal(FOREST_RESOURCES[kind].tool, "hand");
  assert.equal(FOREST_RESOURCES[kind].drop, kind);
}

const tree = forest.objects.find(o => resourceKind(o) === "tree")!;
const herb = forest.objects.find(o => resourceKind(o) === "herb")!;
const rock = forest.objects.find(o => resourceKind(o) === "rock")!;
const target = { x: tree.position.tileX * 32, y: tree.position.tileY * 32 };
assert.equal(findForestResource(forest, target, { x: target.x - 35, y: target.y })?.id, tree.id);
assert.equal(findForestResource(forest, target, { x: target.x - 100, y: target.y }), undefined, "remote clicks cannot collect resources");
assert.deepEqual([FOREST_RESOURCES.tree.hits, FOREST_RESOURCES.rock.tool, FOREST_RESOURCES.herb.drop], [3, "hand", "wild_herb"]);
let progress = emptyForestState(4);
const wrong = strikeForestNode(progress, tree, "hand");
assert.deepEqual(wrong.state, progress); assert.equal(wrong.drop, undefined);
for (let count = 1; count <= 2; count++) {
  const hit = strikeForestNode(progress, tree, "axe");
  assert.equal(hit.remaining, 3 - count); assert.equal(hit.drop, undefined);
  progress = hit.state;
  assert.equal(progress.hits[tree.id], count);
}
assert.equal(normalizeForestState(progress, 4).hits[tree.id], 2, "partial tree damage survives reconnect");
const chopped = strikeForestNode(progress, tree, "axe");
assert.equal(chopped.drop, "wood"); assert.equal(chopped.quantity, 3);
progress = chopped.state;
assert.ok(progress.depleted.includes(tree.id));
assert.equal(strikeForestNode(progress, tree, "axe").drop, undefined, "depleted tree cannot award again");
const picked = strikeForestNode(progress, herb, "hand");
assert.equal(picked.drop, "wild_herb"); progress = picked.state;
assert.equal(strikeForestNode(progress, rock, "axe").drop, undefined, "axe cannot mine rocks");
const pebble = strikeForestNode(progress, rock, "hand");
assert.equal(pebble.drop, "stone"); progress = pebble.state;
const inventory = new Inventory();
inventory.add(chopped.drop, chopped.quantity); inventory.add(picked.drop!, picked.quantity); inventory.add(pebble.drop!, pebble.quantity);
assert.deepEqual([inventory.count("wood"), inventory.count("wild_herb"), inventory.count("stone")], [3, 1, 1]);
const rareNodes = forest.objects.filter(o => ["moon_mushroom", "fairy_bloom"].includes(resourceKind(o) ?? ""));
for (const node of rareNodes.slice(0, 2).concat(rareNodes.find(o => resourceKind(o) === "fairy_bloom")!)) {
  const result = strikeForestNode(progress, node, "hand");
  assert.equal(result.drop, resourceKind(node));
  inventory.add(result.drop!, result.quantity); progress = result.state;
}
assert.equal(inventory.count("moon_mushroom"), 2);
assert.equal(inventory.count("fairy_bloom"), 1);

const save = normalizeSaveData({ version: 4, day: 4, daySerial: 4, selectedTool: "axe", player: { mapId: "fairy_forest", x: 496, y: 656, facing: "up" }, inventory: inventory.serialize(), forestState: progress });
assert.equal(save?.selectedTool, "axe"); assert.deepEqual(save?.forestState, progress);
assert.equal(save?.inventory.items.moon_mushroom, 2); assert.equal(save?.inventory.items.fairy_bloom, 1);
const restored = new MapRegistry(); installFairyForest(restored, "single", 4, save?.forestState);
for (const node of [tree, herb, rock]) assert.ok(!restored.require("fairy_forest").objects.some(o => o.id === node.id), "same-day reconnect retains collection");
for (const node of rareNodes.slice(0, 2).concat(rareNodes.find(o => resourceKind(o) === "fairy_bloom")!)) assert.ok(!restored.require("fairy_forest").objects.some(o => o.id === node.id), "rare nodes stay collected across reconnect");
assert.deepEqual(normalizeForestState(undefined, 4), emptyForestState(4), "legacy SaveData starts with empty forest progress");
assert.deepEqual(normalizeForestState(progress, 5), emptyForestState(5), "next day clears harvested nodes and partial hits");
const tomorrow = new MapRegistry(); installFairyForest(tomorrow, "single", 5, progress);
assert.ok(tomorrow.require("fairy_forest").objects.length > 0, "new day does not inherit depleted set");
assert.deepEqual(normalizeForestState({ ...progress, depleted: ["__proto__", tree.id], hits: { [herb.id]: 999 } }, 4), { daySerial: 4, depleted: [tree.id], hits: {} });
console.log("Forest resources: deterministic nodes, axe hits, hand gathering, save restoration and daily reset passed");
