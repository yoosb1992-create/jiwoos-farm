import { strict as assert } from "node:assert";
import { FamilyError, FamilyRooms } from "../../server/family/rooms";
import { FamilyState } from "../../server/family/state";
import { familyTestDB } from "./family-db";

const { db, close } = familyTestDB();
try {
  const rooms = new FamilyRooms(db, () => 100000), state = new FamilyState(db, () => 100000);
  const a = await rooms.create("A", "제작 테스트", "지우");
  const b = await rooms.join("B", a.room.inviteCode, "수빈");
  const id = a.room.id;
  await state.read("A", id);
  await db.prepare("UPDATE family_state SET inventories_json = ? WHERE room_id = ?")
    .bind(JSON.stringify({ [a.room.playerId]: { items: { wood: 6, stone: 3, wild_herb: 2, fairy_bloom: 1 } }, [b.room.playerId]: { items: { wood: 7, stone: 4, fairy_bloom: 2 } } }), id).run();
  const pose = { mapId: "farmhouse", x: 384, y: 249, facing: "up", selectedTool: "hand", moving: false } as const;
  const action = { kind: "craft", recipeId: "wood_plank", pose };
  const initial = await state.read("A", id);
  const race = await Promise.allSettled([state.act("A", id, initial.revision, action), state.act("A", id, initial.revision, action)]);
  assert.equal(race.filter(r => r.status === "fulfilled").length, 1, "같은 revision의 중복 제작은 한 번만 승인");
  const stale = race.find(r => r.status === "rejected")! as PromiseRejectedResult;
  assert.ok(stale.reason instanceof FamilyError && stale.reason.status === 409 && stale.reason.details.snapshot, "충돌은 최신 snapshot 반환");
  const after = await state.read("A", id), other = await state.read("B", id);
  assert.equal(after.inventory.items.wood, 4); assert.equal(after.inventory.items.wood_plank, 1);
  assert.equal(other.inventory.items.wood, 7); assert.equal(other.inventory.items.wood_plank ?? 0, 0, "B의 개인 inventory 불변");
  await assert.rejects(state.act("A", id, initial.revision, action), (e: unknown) => e instanceof FamilyError && e.status === 409);
  const malicious = await state.act("A", id, after.revision, { ...action, output: "wood", quantity: 999, ingredients: [] });
  assert.equal(malicious.inventory.items.wood, 2); assert.equal(malicious.inventory.items.wood_plank, 2, "클라이언트의 임의 결과·재료는 무시");
  const stone = await state.act("A", id, malicious.revision, { ...action, recipeId: "stone_block" });
  assert.equal(stone.inventory.items.stone, 0); assert.equal(stone.inventory.items.stone_block, 1);
  const thread = await state.act("A", id, stone.revision, { ...action, recipeId: "fairy_thread" });
  assert.equal(thread.inventory.items.wild_herb, 0); assert.equal(thread.inventory.items.fairy_bloom, 0);
  assert.equal(thread.inventory.items.fairy_thread, 1, "희귀 재료는 A의 인벤토리에서만 차감");
  assert.equal((await state.read("B", id)).inventory.items.fairy_bloom, 2);
  const invalid = async (candidate: unknown, status: number) => {
    const before = await state.read("A", id);
    await assert.rejects(state.act("A", id, before.revision, candidate), (e: unknown) => e instanceof FamilyError && e.status === status);
    assert.deepEqual(await state.read("A", id), before, "거절된 제작은 revision·재고를 바꾸지 않음");
  };
  await invalid({ ...action, recipeId: "no_such_recipe" }, 400);
  await invalid({ ...action, recipeId: "fairy_thread" }, 409);
  await invalid({ ...action, pose: { ...pose, x: 0, y: 0 } }, 400);
  await invalid({ ...action, pose: { ...pose, mapId: "farm" } }, 400);
  await assert.rejects(state.act("outsider", id, thread.revision, action), (e: unknown) => e instanceof FamilyError);
  console.log("Family crafting: private materials, recipe authority, proximity, CAS, duplicate and invalid requests passed");
} finally { close(); }
