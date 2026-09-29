import { strict as assert } from "node:assert";
import { FamilyRooms, FamilyError } from "../../server/family/rooms";
import { FamilyState } from "../../server/family/state";
import { familyTestDB } from "./family-db";
import { generateResourceForest, resourceKind } from "../forest/resources";

const { db, close } = familyTestDB();
try {
  const rooms = new FamilyRooms(db, () => 100000), state = new FamilyState(db, () => 100000);
  const a = await rooms.create("A", "개인 도구 숲", "지우"), b = await rooms.join("B", a.room.inviteCode, "수빈");
  const roomId = a.room.id, nodes = generateResourceForest(roomId, 1).objects;
  const trees = nodes.filter(o => resourceKind(o) === "tree"), ore = nodes.find(o => resourceKind(o) === "ore")!;
  assert.ok(trees.length >= 2 && ore);
  await state.read("A", roomId);
  await db.prepare("UPDATE family_state SET inventories_json = ? WHERE room_id = ?")
    .bind(JSON.stringify({ [a.room.playerId]: { items: { wood_plank: 3, stone_block: 2 } }, [b.room.playerId]: { items: {} } }), roomId).run();
  const pose = (node: typeof ore, tool: "axe" | "pickaxe") => ({ mapId: "fairy_forest", x: node.position.tileX * 32 - 35, y: node.position.tileY * 32, facing: "right", moving: false, selectedTool: tool });
  const gather = (node: typeof ore, tool: "axe" | "pickaxe") => ({ kind: "forest-gather", nodeId: node.id, daySerial: 1, tool, pose: pose(node, tool) });
  const send = async (user: string, action: unknown) => state.act(user, roomId, (await state.read(user, roomId)).revision, action);
  await assert.rejects(send("A", gather(ore, "pickaxe")), (e: unknown) => e instanceof FamilyError && e.status === 400, "locked mining denied on server");
  const tablePose = { mapId: "farmhouse", x: 384, y: 249, facing: "up", moving: false, selectedTool: "hand" } as const;
  await send("A", { kind: "tool-upgrade", upgradeId: "axe_2", pose: tablePose });
  assert.deepEqual((await state.read("A", roomId)).toolProgression, { axe: 2, pickaxe: 0 });
  assert.deepEqual((await state.read("B", roomId)).toolProgression, { axe: 1, pickaxe: 0 });
  const lv2 = await send("A", { ...gather(trees[0], "axe"), power: 999, toolProgression: { axe: 999, pickaxe: 999 } });
  assert.equal(lv2.world.forestState?.hits[trees[0].id], 2, "server applies A's Lv2 power");
  const finish = await send("B", gather(trees[0], "axe"));
  assert.ok(finish.world.forestState?.depleted.includes(trees[0].id));
  assert.equal((await state.read("B", roomId)).inventory.items.wood, 3, "final hitter gets wood");
  assert.equal((await state.read("A", roomId)).inventory.items.wood ?? 0, 0);
  const lv1 = await send("B", { ...gather(trees[1], "axe"), power: 999 });
  assert.equal(lv1.world.forestState?.hits[trees[1].id], 1, "A's upgrade does not boost B");
  const complete = await send("A", gather(trees[1], "axe"));
  assert.ok(complete.world.forestState?.depleted.includes(trees[1].id), "A's two damage completes tree");
  await db.prepare("UPDATE family_state SET inventories_json = ? WHERE room_id = ?")
    .bind(JSON.stringify({ [a.room.playerId]: { items: { wood_plank: 2, stone_block: 1 }, toolProgression: { axe: 2, pickaxe: 0 } }, [b.room.playerId]: { items: { wood: 3 } } }), roomId).run();
  await send("A", { kind: "tool-upgrade", upgradeId: "pickaxe_unlock", pose: tablePose });
  const one = await send("A", { ...gather(ore, "pickaxe"), damage: 999, drop: "wood", quantity: 999 });
  assert.equal(one.world.forestState?.hits[ore.id], 1);
  const race = await Promise.allSettled([state.act("A", roomId, one.revision, gather(ore, "pickaxe")), state.act("A", roomId, one.revision, gather(ore, "pickaxe"))]);
  assert.equal(race.filter(r => r.status === "fulfilled").length, 1);
  assert.equal((await state.read("A", roomId)).inventory.items.stone, 3, "one canonical ore reward");
  assert.equal((await state.read("B", roomId)).inventory.items.stone ?? 0, 0);
  assert.deepEqual((await state.read("B", roomId)).toolProgression, { axe: 1, pickaxe: 0 });
} finally { close(); }
console.log("Family tools and forest: private power, locked mining, authoritative hits and CAS rewards passed");
