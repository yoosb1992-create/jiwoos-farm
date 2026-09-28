import { strict as assert } from "node:assert";
import { Inventory, normalizeSaveData } from "../domain";
import { generateFairyForest } from "../forest/generation";
import { installFairyForest } from "../forest/registry";
import { emptyForestState, findForestResource, FOREST_RESOURCES, normalizeForestState, resourceKind, strikeForestNode } from "../forest/resources";
import { MapRegistry } from "../maps/MapRegistry";

const registry = new MapRegistry();
installFairyForest(registry, "single", 4);
const forest = registry.require("fairy_forest");
const original = generateFairyForest("single", 4);
assert.deepEqual(forest.objects.filter(o => o.assetId !== "forest_herb"), original.objects, "existing tree and rock layout stays unchanged");
assert.ok(forest.objects.some(o => o.assetId === "forest_herb"));
const same = new MapRegistry(); installFairyForest(same, "single", 4);
assert.deepEqual(same.require("fairy_forest").objects, forest.objects, "same day produces identical resource node IDs and positions");
const next = new MapRegistry(); installFairyForest(next, "single", 5);
assert.notDeepEqual(next.require("fairy_forest").objects, forest.objects, "new day regenerates nodes");

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

const save = normalizeSaveData({ version: 4, day: 4, daySerial: 4, selectedTool: "axe", player: { mapId: "fairy_forest", x: 496, y: 656, facing: "up" }, inventory: inventory.serialize(), forestState: progress });
assert.equal(save?.selectedTool, "axe"); assert.deepEqual(save?.forestState, progress);
const restored = new MapRegistry(); installFairyForest(restored, "single", 4, save?.forestState);
for (const node of [tree, herb, rock]) assert.ok(!restored.require("fairy_forest").objects.some(o => o.id === node.id), "same-day reconnect retains collection");
assert.deepEqual(normalizeForestState(undefined, 4), emptyForestState(4), "legacy SaveData starts with empty forest progress");
assert.deepEqual(normalizeForestState(progress, 5), emptyForestState(5), "next day clears harvested nodes and partial hits");
const tomorrow = new MapRegistry(); installFairyForest(tomorrow, "single", 5, progress);
assert.ok(tomorrow.require("fairy_forest").objects.length > 0, "new day does not inherit depleted set");
assert.deepEqual(normalizeForestState({ ...progress, depleted: ["__proto__", tree.id], hits: { [herb.id]: 999 } }, 4), { daySerial: 4, depleted: [tree.id], hits: {} });
console.log("Forest resources: deterministic nodes, axe hits, hand gathering, save restoration and daily reset passed");
