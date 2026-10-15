import { strict as assert } from "node:assert";
import { emptyForestState, strikeForestNode } from "../forest/resources";
import { forestFeedback } from "../forest/feedback";
import { generateResourceForest } from "../forest/resources";

const forest = generateResourceForest("feedback", 3);
const tree = forest.objects.find(o => o.id.startsWith("tree-"))!;
const herb = forest.objects.find(o => o.id.startsWith("herb-"))!;
let state = emptyForestState(3);
assert.equal(forestFeedback(tree, state, state), null, "failed action has no visual reward");
for (let hit = 1; hit <= 2; hit++) {
  const next = strikeForestNode(state, tree, "axe").state;
  assert.deepEqual(forestFeedback(tree, state, next), { kind: "hit", progress: `${hit}/3` });
  state = next;
}
const fell = strikeForestNode(state, tree, "axe");
assert.deepEqual(forestFeedback(tree, state, fell.state), { kind: "felled", pickup: undefined }, "no pickup before confirmed inventory");
assert.deepEqual(forestFeedback(tree, state, fell.state, "wood", 3), { kind: "felled", pickup: "+3 목재" });
assert.equal(forestFeedback(tree, fell.state, fell.state, "wood", 3), null, "duplicate snapshot has no feedback");
const picked = strikeForestNode(fell.state, herb, "hand");
assert.deepEqual(forestFeedback(herb, fell.state, picked.state, "wild_herb", 1), { kind: "picked", pickup: "+1 들풀" });
console.log("Forest feedback: authoritative transitions, partial hits and confirmed pickup passed");
