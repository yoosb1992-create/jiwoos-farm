import { strict as assert } from "node:assert";
import { FamilyRooms, FamilyError } from "../../server/family/rooms";
import { FamilyState } from "../../server/family/state";
import { FamilyPresenceService } from "../../server/family/presence";
import { RemotePlayers } from "../family/RemotePlayers";
import { generateResourceForest, resourceKind } from "../forest/resources";
import { installFairyForest } from "../forest/registry";
import { MapRegistry } from "../maps/MapRegistry";
import { WorldRenderer } from "../rendering/WorldRenderer";
import { familyTestDB } from "./family-db";

const { db, close } = familyTestDB();
try {
  const now = () => 100000;
  const rooms = new FamilyRooms(db, now), service = new FamilyState(db, now);
  const a = await rooms.create("A", "가족 숲", "지우");
  const b = await rooms.join("B", a.room.inviteCode, "수빈");
  const roomId = a.room.id, forest = generateResourceForest(roomId, 1);
  assert.deepEqual(forest.objects, generateResourceForest(roomId, 1).objects, "family A/B have identical node IDs");
  const tree = forest.objects.find(o => resourceKind(o) === "tree")!;
  const herb = forest.objects.find(o => resourceKind(o) === "herb")!;
  const rock = forest.objects.find(o => resourceKind(o) === "rock")!;
  const mushroom = forest.objects.find(o => resourceKind(o) === "moon_mushroom")!;
  const bloom = forest.objects.find(o => resourceKind(o) === "fairy_bloom")!;
  assert.deepEqual([mushroom, bloom], [mushroom, bloom].map(o => generateResourceForest(roomId, 1).objects.find(n => n.id === o.id)), "A/B see identical rare nodes");
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
  const rareBefore = await service.read("A", roomId);
  const race = await Promise.allSettled([
    service.act("A", roomId, rareBefore.revision, gather(mushroom, "hand")),
    service.act("B", roomId, rareBefore.revision, gather(mushroom, "hand")),
  ]);
  assert.equal(race.filter(r => r.status === "fulfilled").length, 1, "rare forage CAS prevents duplicate rewards");
  assert.ok((await service.read("B", roomId)).world.forestState?.depleted.includes(mushroom.id));
  assert.equal(((await service.read("A", roomId)).inventory.items.moon_mushroom ?? 0) + ((await service.read("B", roomId)).inventory.items.moon_mushroom ?? 0), 1);
  const bloomBefore = await service.read("B", roomId);
  await service.act("B", roomId, bloomBefore.revision, gather(bloom, "hand"));
  assert.equal((await service.read("B", roomId)).inventory.items.fairy_bloom, 1, "rare inventory persists on reconnect");
  assert.ok((await service.read("A", roomId)).world.forestState?.depleted.includes(bloom.id), "A sees B's gathered bloom disappear");

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
  await expectInvalid({ ...gather(mushroom, "hand"), nodeId: "moon_mushroom-999-999" });
  await expectInvalid({ ...gather(bloom, "hand"), nodeId: "fairy_bloom-999-999" });
  const latest = await service.read("A", roomId);
  await assert.rejects(service.act("outsider", roomId, latest.revision, gather(rock, "hand")), (e: unknown) => e instanceof FamilyError);
  const slept = await service.act("A", roomId, latest.revision, { kind: "sleep", pose: { mapId: "farmhouse", x: 304, y: 224, facing: "down", selectedTool: "hand", moving: false } });
  assert.equal(slept.world.daySerial, 2);
  assert.deepEqual(slept.world.forestState, { daySerial: 2, depleted: [], hits: {} }, "next day clears shared node progress");
  await expectInvalid(gather(rock, "hand"), 400);
  assert.notDeepEqual(generateResourceForest(roomId, 1).objects, generateResourceForest(roomId, 2).objects);
  const clientMap = new MapRegistry();
  installFairyForest(clientMap, roomId, 1, winner.value.world.forestState);
  assert.ok(!clientMap.require("fairy_forest").objects.some(o => o.id === tree.id), "snapshot removes depleted tree on another client");
  installFairyForest(clientMap, roomId, 2, slept.world.forestState);
  assert.deepEqual(clientMap.require("fairy_forest").objects, generateResourceForest(roomId, 2).objects, "new-day snapshot regenerates every node");

  const labels: string[] = []; let removed = 0;
  const text = () => {
    const label: any = { setText(value: string) { labels.push(value); return label; }, setOrigin() { return label; }, setDepth() { return label; }, destroy() { removed++; } };
    return label;
  };
  const worldRenderer = new WorldRenderer({ add: { text } } as never, clientMap);
  (worldRenderer as unknown as { root: { add: (node: unknown) => void } }).root = { add: () => {} };
  const nextTreeForLabel = clientMap.require("fairy_forest").objects.find(o => resourceKind(o) === "tree")!;
  worldRenderer.renderForestHits({ [nextTreeForLabel.id]: 1 });
  worldRenderer.renderForestHits({ [nextTreeForLabel.id]: 2 });
  assert.deepEqual(labels, ["2/3"], "other family tree hits update an existing label");
  worldRenderer.renderForestHits({}); assert.equal(removed, 1, "label disappears when hits reset or tree is removed");

  const nextTree = generateResourceForest(roomId, 2).objects.find(o => resourceKind(o) === "tree")!;
  const presence = new FamilyPresenceService(db, now);
  const sessionA = crypto.randomUUID(), sessionB = crypto.randomUUID();
  await presence.heartbeat("A", roomId, poseAt(nextTree), sessionA);
  await presence.heartbeat("B", roomId, poseAt(nextTree), sessionB);
  const nextAction = { ...gather(nextTree), daySerial: 2 };
  const hit = await service.act("A", roomId, slept.revision, nextAction);
  assert.equal(hit.world.forestState?.hits[nextTree.id], 1);
  const seen = await presence.read("B", roomId);
  const actor = seen.players.find(p => p.playerId === a.room.playerId)!;
  assert.equal(actor.action?.tool, "axe", "committed axe hit produces short-lived presence action");
  const animations: string[] = [];
  const node = () => {
    const proxy: any = new Proxy({ x: 0, y: 0 }, { get(target, key) { return key in target ? target[key as keyof typeof target] : (...args: any[]) => {
      if (key === "play") animations.push(args[0]);
      if (key === "setPosition") { target.x = args[0]; target.y = args[1]; }
      return proxy;
    }; } }); return proxy;
  };
  const remote = new RemotePlayers({ add: { sprite: node, text: node } } as never, b.room.playerId);
  remote.receive(seen); remote.update("fairy_forest", 16);
  assert.ok(animations.includes("tool_right"), "remote axe uses existing tool-right player animation");
  remote.destroy();
  console.log("Family forest: shared hits, concurrent final hit/herb CAS, authority checks, daily reset and private drops passed");
} finally { close(); }
