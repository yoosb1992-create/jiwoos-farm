import { strict as assert } from "node:assert";
import { FamilyError, FamilyRooms } from "../../server/family/rooms";
import { FamilyState } from "../../server/family/state";
import { CROP_DEFINITIONS } from "../data/crops";
import { normalizeSaveData } from "../domain";
import {
  FARM_TREE_RESOURCE,
  emptyFarmTreeState,
  farmTreeIds,
  farmTreeInFacingReach,
  isFarmTreeObject,
  normalizeFarmTreeState,
  strikeFarmTree,
} from "../farm/trees";
import { MAP_DEFINITIONS } from "../maps/definitions";
import { playerInteractionAnchorFromPosition } from "../player/interaction";
import { plantedSeedAccent } from "../rendering/WorldRenderer";
import { familyTestDB } from "./family-db";

const farm = MAP_DEFINITIONS.farm;
const ids = farmTreeIds(farm);
const trees = farm.objects.filter(isFarmTreeObject);
assert.equal(trees.length, 12, "authored farm_tree_* objects are the only farm lumber nodes");
assert.deepEqual(normalizeFarmTreeState(undefined, ids), emptyFarmTreeState(), "old saves keep every farm tree");

const tree = trees[0];
let state = emptyFarmTreeState();
assert.equal(strikeFarmTree(state, tree, "hand").state, state, "non-axe tools cannot damage farm trees");
for (let hit = 1; hit <= FARM_TREE_RESOURCE.hits; hit++) {
  const result = strikeFarmTree(state, tree, "axe");
  state = result.state;
  if (hit < FARM_TREE_RESOURCE.hits) assert.equal(state.hits[tree.id], hit);
  else {
    assert.ok(state.depleted.includes(tree.id));
    assert.deepEqual([result.drop, result.quantity], ["wood", 3]);
  }
}
const upgradedFirst = strikeFarmTree(emptyFarmTreeState(), trees[1], "axe", { axe: 2, pickaxe: 0 });
assert.equal(upgradedFirst.state.hits[trees[1].id], 2, "existing axe power is reused");
assert.equal(strikeFarmTree(upgradedFirst.state, trees[1], "axe", { axe: 2, pickaxe: 0 }).remaining, 0);

const nodeX = tree.position.tileX * 32, nodeY = tree.position.tileY * 32;
const anchorOffset = playerInteractionAnchorFromPosition({ x: 0, y: 0 });
const facingPose = { x: nodeX - 32, y: nodeY - anchorOffset.y, facing: "right" as const };
assert.equal(farmTreeInFacingReach(farm, tree, facingPose), true, "lower-body target reaches the tree in front");
assert.equal(farmTreeInFacingReach(farm, tree, { ...facingPose, facing: "left" }), false, "tree behind the player is rejected");
assert.equal(farmTreeInFacingReach(farm, tree, { ...facingPose, x: facingPose.x - 200 }), false, "distant tree is rejected");

const baseSave = {
  version: 4, day: 1, timeMinutes: 360, money: 120, selectedTool: "axe",
  player: { mapId: "farm", x: 224, y: 256, facing: "down" }, inventory: { items: {} }, farm: [], savedAt: 1,
};
assert.deepEqual(normalizeSaveData(baseSave)?.farmTreeState, emptyFarmTreeState(), "SaveData v4 missing field defaults empty without migration");
assert.deepEqual(normalizeSaveData({ ...baseSave, farmTreeState: state })?.farmTreeState, state, "removed farm trees persist in SaveData v4");

const cropIds = Object.keys(CROP_DEFINITIONS) as Array<keyof typeof CROP_DEFINITIONS>;
assert.deepEqual(cropIds, ["sproutberry", "sunpotato", "heartberry", "morningcarrot"]);
assert.equal(new Set(cropIds.map(plantedSeedAccent)).size, 4, "all four crops receive a readable crop-specific seed point on the common mound");
for (const crop of Object.values(CROP_DEFINITIONS)) assert.equal(crop.stages[0].growthDay, 0, `${crop.id} keeps stage 0 as planted seed`);

const { db, close } = familyTestDB();
try {
  const rooms = new FamilyRooms(db, () => 100_000), service = new FamilyState(db, () => 100_000);
  const a = await rooms.create("farm-tree-A", "농장 나무", "지우");
  await rooms.join("farm-tree-B", a.room.inviteCode, "수빈");
  const roomId = a.room.id;
  const action = (pose = facingPose) => ({
    kind: "farm-tree-hit", nodeId: tree.id, tool: "axe", pose: { mapId: "farm", ...pose, selectedTool: "axe", moving: false },
  });
  const first = await service.act("farm-tree-A", roomId, 0, action());
  assert.equal(first.world.farmTreeState?.hits[tree.id], 1);
  assert.equal((await service.read("farm-tree-B", roomId)).world.farmTreeState?.hits[tree.id], 1, "family B sees A's farm-tree hit");
  const second = await service.act("farm-tree-B", roomId, first.revision, action());
  const race = await Promise.allSettled([
    service.act("farm-tree-A", roomId, second.revision, action()),
    service.act("farm-tree-B", roomId, second.revision, action()),
  ]);
  assert.equal(race.filter((result) => result.status === "fulfilled").length, 1, "CAS permits only one final farm-tree hit");
  const winner = race.find((result) => result.status === "fulfilled") as PromiseFulfilledResult<Awaited<ReturnType<typeof service.act>>>;
  const loser = race.find((result) => result.status === "rejected") as PromiseRejectedResult;
  assert.ok(winner.value.world.farmTreeState?.depleted.includes(tree.id));
  assert.ok(loser.reason instanceof FamilyError && loser.reason.status === 409);
  const woodA = (await service.read("farm-tree-A", roomId)).inventory.items.wood ?? 0;
  const woodB = (await service.read("farm-tree-B", roomId)).inventory.items.wood ?? 0;
  assert.equal(woodA + woodB, 3, "wood is awarded once to the final hitter's personal inventory");

  const rejectWithoutMutation = async (invalid: unknown) => {
    const before = await service.read("farm-tree-A", roomId);
    await assert.rejects(service.act("farm-tree-A", roomId, before.revision, invalid), (error: unknown) => error instanceof FamilyError);
    assert.equal((await service.read("farm-tree-A", roomId)).revision, before.revision);
  };
  await rejectWithoutMutation({ ...action(), nodeId: trees[2].id, tool: "hand", pose: { ...action().pose, selectedTool: "hand" } });
  await rejectWithoutMutation(action({ ...facingPose, x: facingPose.x - 200 }));
  await rejectWithoutMutation(action({ ...facingPose, facing: "left" }));

  const oldRoom = await rooms.create("legacy-tree", "옛 농장", "엄마");
  await db.prepare("UPDATE family_state SET world_json=json_remove(world_json, '$.farmTreeState') WHERE room_id=?").bind(oldRoom.room.id).run();
  assert.deepEqual((await service.read("legacy-tree", oldRoom.room.id)).world.farmTreeState, emptyFarmTreeState(), "old Family world defaults to all trees present");

  const seedRoom = await rooms.create("seed-A", "씨앗 농장", "씨앗");
  await rooms.join("seed-B", seedRoom.room.inviteCode, "관찰자");
  const seedRoomId = seedRoom.room.id, tile = (await service.read("seed-A", seedRoomId)).world.farm[0];
  const toolPose = { mapId: "farm", x: (tile.x + .5) * 32, y: (tile.y + .5) * 32, facing: "down" as const, moving: false };
  const tilled = await service.act("seed-A", seedRoomId, 0, { kind: "tool", tool: "hoe", x: tile.x, y: tile.y, pose: { ...toolPose, selectedTool: "hoe" } });
  const planted = await service.act("seed-A", seedRoomId, tilled.revision, { kind: "tool", tool: "seed", cropId: "sproutberry", x: tile.x, y: tile.y, pose: { ...toolPose, selectedTool: "seed" } });
  assert.equal(planted.world.farm[0].cropStage, 0);
  assert.equal((await service.read("seed-B", seedRoomId)).world.farm[0].cropStage, 0, "Family snapshot immediately exposes planted stage 0");
  assert.equal(planted.inventory.items.sproutberry_seed, 7, "seed count decreases once");

  console.log("In-Play farm fixes: farm-tree authority/persistence/CAS and four-crop planted visuals passed");
} finally { close(); }
