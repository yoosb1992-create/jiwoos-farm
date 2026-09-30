import { strict as assert } from "node:assert";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StoragePanel } from "../../app/components/StoragePanel";
import { Inventory, normalizeSaveData } from "../domain";
import { ITEM_DEFINITIONS, type ItemId } from "../data/items";
import { MAP_DEFINITIONS } from "../maps/definitions";
import { initialPlayerStats } from "../player/stats";
import { CONTAINER_DEFINITIONS } from "../storage/definitions";
import { initialStorage, isStorableItemId, normalizeStorage, transferItem, transferItemsAtomically } from "../storage/container";
import { FamilyError, FamilyRooms } from "../../server/family/rooms";
import { FamilyState } from "../../server/family/state";
import { familyTestDB } from "./family-db";
import { weatherFor } from "../weather/system";

const id = "family_chest";
const chest = initialStorage(), bag = new Inventory({ items: { wood: 5, stone: 1 } });
assert.deepEqual(chest.containers[id].items, {});
assert.equal(CONTAINER_DEFINITIONS[id].scope, "shared");
assert.equal(transferItem(bag, chest, id, "deposit", "wood", 3), null);
assert.deepEqual([bag.count("wood"), chest.containers[id].items.wood], [2, 3]);
assert.equal(transferItem(bag, chest, id, "deposit", "wood", 2), null);
assert.deepEqual([bag.count("wood"), chest.containers[id].items.wood], [0, 5]);
assert.equal(transferItem(bag, chest, id, "withdraw", "wood", 2), null);
assert.equal(transferItem(bag, chest, id, "withdraw", "wood", 3), null);
assert.deepEqual([bag.count("wood"), chest.containers[id].items.wood], [5, 0]);
for (const [direction, item, quantity] of [
  ["deposit", "wood", 0], ["deposit", "wood", -1], ["deposit", "wood", 1.5], ["deposit", "wood", "2"],
  ["deposit", "invalid", 1], ["deposit", "axe", 1], ["withdraw", "wood", 1], ["deposit", "wood", 6],
  ["withdraw", "wood", Number.MAX_SAFE_INTEGER], ["wrong", "wood", 1],
] as const) {
  const before = [bag.serialize(), structuredClone(chest)];
  assert.ok(transferItem(bag, chest, id, direction, item, quantity));
  assert.deepEqual([bag.serialize(), chest], before, "failed move is atomic");
}
const fill = initialStorage(), supply = new Inventory({ items: {} });
const kinds = (Object.keys(ITEM_DEFINITIONS) as ItemId[]).filter(isStorableItemId);
assert.ok(kinds.length > CONTAINER_DEFINITIONS[id].capacity);
for (const item of kinds) supply.add(item, 2);
for (const item of kinds.slice(0, CONTAINER_DEFINITIONS[id].capacity)) assert.equal(transferItem(supply, fill, id, "deposit", item, 1), null);
const overflow = kinds[CONTAINER_DEFINITIONS[id].capacity];
const fullBefore = [supply.serialize(), structuredClone(fill)];
assert.match(transferItem(supply, fill, id, "deposit", overflow, 1)!, /가득/);
assert.deepEqual([supply.serialize(), fill], fullBefore);
assert.equal(transferItem(supply, fill, id, "deposit", kinds[0], 1), null, "existing stack accepts more");
assert.equal(transferItem(supply, fill, id, "withdraw", kinds[1], 1), null);
assert.equal(transferItem(supply, fill, id, "deposit", overflow, 1), null, "emptied stack frees capacity");
assert.deepEqual(normalizeStorage({ containers: { [id]: { items: { wood: 3, fake: 99, stone: -1 } } } }).containers[id].items, { wood: 3 });
const batchBag = new Inventory({ items: { wood: 5, stone: 2 } }), batchChest = initialStorage();
assert.equal(transferItemsAtomically(batchBag, batchChest, id, [
  { direction: "deposit", itemId: "wood", quantity: 3 },
  { direction: "deposit", itemId: "stone", quantity: 1 },
]), null);
assert.deepEqual([batchBag.count("wood"), batchBag.count("stone"), batchChest.containers[id].items.wood, batchChest.containers[id].items.stone], [2, 1, 3, 1]);
const batchBefore = [batchBag.serialize(), structuredClone(batchChest)];
assert.match(transferItemsAtomically(batchBag, batchChest, id, [
  { direction: "withdraw", itemId: "wood", quantity: 2 },
  { direction: "deposit", itemId: "stone", quantity: 99 },
])!, /부족/);
assert.deepEqual([batchBag.serialize(), batchChest], batchBefore, "failed batch must commit nothing");

const saved = { version: 4, day: 3, daySerial: 31, timeMinutes: 500, money: 222, selectedTool: "axe",
  player: { mapId: "farmhouse", x: 96, y: 160, facing: "up" }, inventory: bag.serialize(), storage: fill,
  stats: { ...initialPlayerStats(), stamina: 43, skills: { ...initialPlayerStats().skills, farming: { level: 2, experience: 30 } } },
  toolProgression: { axe: 2, pickaxe: 1 }, farm: [], savedAt: 5 };
const loaded = normalizeSaveData(JSON.parse(JSON.stringify(saved)))!;
assert.deepEqual(loaded.storage, normalizeStorage(fill));
assert.deepEqual(loaded.stats, saved.stats);
assert.deepEqual(loaded.toolProgression, saved.toolProgression);
assert.equal(loaded.daySerial, 31); assert.equal(loaded.money, 222);
for (const version of [1, 2, 3, 4]) assert.deepEqual(normalizeSaveData({ ...saved, version, storage: undefined })?.storage, initialStorage(), `v${version} empty storage`);
const obj = MAP_DEFINITIONS.farmhouse.objects.find(o => o.interaction?.containerId === id)!;
assert.equal(obj.interaction?.action, "storage");
assert.ok(MAP_DEFINITIONS.farmhouse.objects.some(o => o.interaction?.action === "sleep"));
assert.ok(MAP_DEFINITIONS.farmhouse.objects.some(o => o.interaction?.action === "craft"));
const markup = renderToStaticMarkup(createElement(StoragePanel, { containerId: id, storage: fill, items: supply.serialize().items, busy: false, onCommit: () => {}, onClose: () => {} }));
assert.ok(markup.includes("내 가방") && markup.includes("가족 보관함") && markup.includes("전부 넣기") && markup.includes("전부 꺼내기") && markup.includes("확인") && markup.includes("실제 저장에 반영되지 않습니다"));

const { db, close } = familyTestDB();
try {
  const rooms = new FamilyRooms(db, () => 100000), state = new FamilyState(db, () => 100000);
  const a = await rooms.create("storage-A", "보관함", "A"), b = await rooms.join("storage-B", a.room.inviteCode, "B");
  const roomId = a.room.id;
  await state.read("storage-A", roomId);
  await db.prepare("UPDATE family_state SET inventories_json=? WHERE room_id=?")
    .bind(JSON.stringify({ [a.room.playerId]: { items: { wood: 5 }, stats: saved.stats, toolProgression: saved.toolProgression }, [b.room.playerId]: { items: { wood: 0 } } }), roomId).run();
  const pose = { mapId: "farmhouse", x: 96, y: 160, facing: "up", selectedTool: "hand", moving: false };
  const action = (direction: string, quantity: unknown, itemId = "wood", at = pose) => ({ kind: "storage", containerId: id, direction, itemId, quantity, pose: at });
  const act = async (user: string, value: object) => state.act(user, roomId, (await state.read(user, roomId)).revision, value);
  const lockedA = await act("storage-A", { kind: "storage-lock", containerId: id, acquire: true, pose });
  assert.ok(lockedA.revision > 0);
  await assert.rejects(
    act("storage-B", { kind: "storage-lock", containerId: id, acquire: true, pose }),
    (error: unknown) => error instanceof FamilyError && error.status === 409 && /사용 중/.test(error.message),
    "only one family member may hold the chest lock",
  );
  await assert.rejects(
    act("storage-B", action("withdraw", 1)),
    (error: unknown) => error instanceof FamilyError && error.status === 409,
    "another member cannot mutate storage while it is locked",
  );
  await act("storage-A", { kind: "storage-lock", containerId: id, acquire: false, pose });
  await act("storage-B", { kind: "storage-lock", containerId: id, acquire: true, pose });
  await act("storage-B", { kind: "storage-lock", containerId: id, acquire: false, pose });
  const first = await act("storage-A", action("deposit", 3));
  assert.deepEqual([first.inventory.items.wood, first.world.storage?.containers[id].items.wood], [2, 3]);
  assert.equal(first.stats?.stamina, 43); assert.equal(first.stats?.skills.farming.experience, 30);
  const fromB = await state.read("storage-B", roomId);
  assert.equal(fromB.world.storage?.containers[id].items.wood, 3);
  assert.equal(fromB.inventory.items.wood, 0);
  const second = await act("storage-B", action("withdraw", 2));
  assert.deepEqual([second.inventory.items.wood, second.world.storage?.containers[id].items.wood], [2, 1]);
  assert.equal((await state.read("storage-A", roomId)).inventory.items.wood, 2);
  const beforeFailure = await state.read("storage-A", roomId);
  for (const bad of [action("deposit", 99), action("withdraw", 99), action("deposit", 0), action("deposit", 1, "fake"), action("withdraw", 1, "axe"), action("deposit", 1, "wood", { ...pose, x: 500 }), action("deposit", 1, "wood", { ...pose, mapId: "farm" })]) {
    await assert.rejects(act("storage-A", bad), (error: unknown) => error instanceof FamilyError && [400, 409].includes(error.status));
    assert.deepEqual(await state.read("storage-A", roomId), beforeFailure, "rejected action leaves revision, world and personal data intact");
  }
  const third = await act("storage-A", action("deposit", 2));
  assert.equal(third.world.storage?.containers[id].items.wood, 3);
  const batch = await act("storage-A", { kind: "storage-batch", containerId: id, transfers: [
    { direction: "withdraw", itemId: "wood", quantity: 1 },
    { direction: "deposit", itemId: "wood", quantity: 1 },
  ], pose });
  assert.equal(batch.world.storage?.containers[id].items.wood, 3, "Family batch commits the confirmed draft atomically");
  const revision = batch.revision;
  const race = await Promise.allSettled([state.act("storage-A", roomId, revision, action("withdraw", 3)), state.act("storage-B", roomId, revision, action("withdraw", 3))]);
  assert.equal(race.filter(result => result.status === "fulfilled").length, 1);
  const loser = race.find(result => result.status === "rejected") as PromiseRejectedResult;
  assert.ok(loser.reason instanceof FamilyError && loser.reason.status === 409 && loser.reason.details.snapshot);
  const afterA = await state.read("storage-A", roomId), afterB = await state.read("storage-B", roomId);
  assert.equal(afterA.world.storage?.containers[id].items.wood ?? 0, 0);
  assert.equal((afterA.inventory.items.wood ?? 0) + (afterB.inventory.items.wood ?? 0), 5, "no duplication across private bags and shared chest");
  assert.equal(afterA.stats?.stamina, 43); assert.equal(afterA.toolProgression?.axe, 2);
  assert.equal(afterA.world.daySerial, afterB.world.daySerial);
  assert.equal(weatherFor(roomId, afterA.world.daySerial!), weatherFor(roomId, afterB.world.daySerial!));
  assert.equal(afterA.world.forestState?.daySerial, afterB.world.forestState?.daySerial);
  console.log("Storage containers: atomic transfers, confirm batches, single-user lock, capacity, Family sharing and CAS passed");
} finally { close(); }
