import { strict as assert } from "node:assert";
import { FamilyRooms, FamilyError } from "../../server/family/rooms";
import { FamilyState } from "../../server/family/state";
import { generateResourceForest, resourceKind } from "../forest/resources";
import { familyTestDB } from "./family-db";

const { db, close } = familyTestDB();
try {
  const now = () => 100000;
  const rooms = new FamilyRooms(db, now), service = new FamilyState(db, now);
  const a = await rooms.create("A", "가족 숲", "지우");
  await rooms.join("B", a.room.inviteCode, "수빈");
  const roomId = a.room.id, forest = generateResourceForest(roomId, 1);
  assert.deepEqual(forest.objects, generateResourceForest(roomId, 1).objects, "family A/B have identical node IDs");
  const tree = forest.objects.find(o => resourceKind(o) === "tree")!;
  const herb = forest.objects.find(o => resourceKind(o) === "herb")!;
  const rock = forest.objects.find(o => resourceKind(o) === "rock")!;
  const poseAt = (node: typeof tree, tool: "axe" | "hand" = "axe") => ({ mapId: "fairy_forest", x: node.position.tileX * 32 - 35, y: node.position.tileY * 32, facing: "right", moving: false, selectedTool: tool });
  const gather = (node: typeof tree, tool: "axe" | "hand" = "axe") => ({ kind: "forest-gather", nodeId: node.id, daySerial: 1, tool, pose: poseAt(node, tool) });
  const before = await service.read("A", roomId);
  const first = await service.act("A", roomId, before.revision, gather(tree));
  assert.equal(first.world.forestState?.hits[tree.id], 1);
  assert.equal((await service.read("B", roomId)).world.forestState?.hits[tree.id], 1, "B sees A's first hit");
  const second = await service.act("B", roomId, first.revision, gather(tree));
  assert.equal(second.world.forestState?.hits[tree.id], 2);
  const competing = await Promise.allSettled([
    service.act("A", roomId, second.revision, gather(tree)),
    service.act("B", roomId, second.revision, gather(tree)),
  ]);
  assert.equal(competing.filter(r => r.status === "fulfilled").length, 1, "only one final axe hit commits");
  const winner = competing.find(r => r.status === "fulfilled")! as PromiseFulfilledResult<Awaited<ReturnType<typeof service.act>>>;
  const loser = competing.find(r => r.status === "rejected")! as PromiseRejectedResult;
  assert.ok(loser.reason instanceof FamilyError && loser.reason.status === 409 && (loser.reason.details.snapshot as Awaited<ReturnType<typeof service.read>>)?.world.forestState?.depleted.includes(tree.id), "loser gets fresh snapshot, no replay");
  assert.ok(winner.value.world.forestState?.depleted.includes(tree.id));
  const inventoryA = (await service.read("A", roomId)).inventory.items.wood ?? 0;
  const inventoryB = (await service.read("B", roomId)).inventory.items.wood ?? 0;
  assert.equal(inventoryA + inventoryB, 3, "wood goes only to the final hitter once");
  const current = await service.read("A", roomId);
  await assert.rejects(service.act("A", roomId, current.revision, gather(tree)), (e: unknown) => e instanceof FamilyError && e.status === 409);

  const herbAction = gather(herb, "hand");
  const herbRace = await Promise.allSettled([service.act("A", roomId, current.revision, herbAction), service.act("B", roomId, current.revision, herbAction)]);
  assert.equal(herbRace.filter(r => r.status === "fulfilled").length, 1, "simultaneous herb collection awards only once");
  const herbA = (await service.read("A", roomId)).inventory.items.wild_herb ?? 0;
  const herbB = (await service.read("B", roomId)).inventory.items.wild_herb ?? 0;
  assert.equal(herbA + herbB, 1);
  const pebble = await service.read("A", roomId);
  const stone = await service.act("B", roomId, pebble.revision, gather(rock, "hand"));
  assert.equal(stone.inventory.items.stone, 1);

  const expectInvalid = async (action: unknown, status = 400) => {
    const latest = await service.read("A", roomId);
    await assert.rejects(service.act("A", roomId, latest.revision, action), (e: unknown) => e instanceof FamilyError && e.status === status);
    assert.equal((await service.read("A", roomId)).revision, latest.revision, "invalid request does not write world or inventory");
  };
  await expectInvalid({ ...gather(tree), nodeId: "tree-999-999" });
  await expectInvalid({ ...gather(tree), daySerial: 2 });
  await expectInvalid({ ...gather(rock, "hand"), pose: { ...poseAt(rock, "hand"), mapId: "road" } });
  await expectInvalid({ ...gather(rock, "hand"), pose: { ...poseAt(rock, "hand"), x: 0, y: 0 } });
  await expectInvalid({ ...gather(rock, "hand"), tool: "axe", pose: poseAt(rock) });
  await expectInvalid({ ...gather(tree), nodeId: "herb-999-999", drop: "wood", quantity: 999 });
  const latest = await service.read("A", roomId);
  await assert.rejects(service.act("outsider", roomId, latest.revision, gather(rock, "hand")), (e: unknown) => e instanceof FamilyError);
  const slept = await service.act("A", roomId, latest.revision, { kind: "sleep", pose: { mapId: "farmhouse", x: 304, y: 224, facing: "down", selectedTool: "hand", moving: false } });
  assert.equal(slept.world.daySerial, 2);
  assert.deepEqual(slept.world.forestState, { daySerial: 2, depleted: [], hits: {} }, "next day clears shared node progress");
  await expectInvalid(gather(rock, "hand"), 400);
  assert.notDeepEqual(generateResourceForest(roomId, 1).objects, generateResourceForest(roomId, 2).objects);
  console.log("Family forest: shared hits, concurrent final hit/herb CAS, authority checks, daily reset and private drops passed");
} finally { close(); }
