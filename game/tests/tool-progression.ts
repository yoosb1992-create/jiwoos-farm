import { strict as assert } from "node:assert";
import { normalizeSaveData } from "../domain";
import { INITIAL_TOOL_PROGRESSION, TOOL_LEVELS, TOOL_UPGRADES } from "../tools/definitions";
import { normalizeToolProgression, toolPower } from "../tools/progression";
import { ITEM_DEFINITIONS } from "../data/items";
import { FamilyRooms } from "../../server/family/rooms";
import { FamilyState } from "../../server/family/state";
import { familyTestDB } from "./family-db";

assert.deepEqual(normalizeToolProgression(undefined), { axe: 1, pickaxe: 0 });
assert.deepEqual(normalizeToolProgression({ axe: 999, pickaxe: "1" }), { axe: 1, pickaxe: 0 });
assert.equal(toolPower(INITIAL_TOOL_PROGRESSION, "axe"), 1);
assert.equal(toolPower(INITIAL_TOOL_PROGRESSION, "pickaxe"), 0);
for (const upgrade of Object.values(TOOL_UPGRADES)) {
  const target = TOOL_LEVELS[upgrade.tool][upgrade.toLevel as keyof typeof TOOL_LEVELS[typeof upgrade.tool]];
  assert.ok(target && target.resourcePower > 0 && target.name);
  assert.deepEqual(upgrade.materials, target.materials);
  for (const material of upgrade.materials) assert.ok(material.quantity > 0 && ITEM_DEFINITIONS[material.itemId]);
}
const oldSave = normalizeSaveData({ version: 4, inventory: { items: { wood: 3 } } });
assert.deepEqual(normalizeToolProgression(oldSave?.toolProgression), INITIAL_TOOL_PROGRESSION, "이전 SaveData 기본 도구 단계");
assert.deepEqual(normalizeSaveData({ version: 4, toolProgression: { axe: 2, pickaxe: 1 } })?.toolProgression, { axe: 2, pickaxe: 1 });

const { db, close } = familyTestDB();
try {
  const rooms = new FamilyRooms(db, () => 1000), state = new FamilyState(db, () => 1000);
  const a = await rooms.create("A", "도구 기록", "지우");
  await rooms.join("B", a.room.inviteCode, "수빈");
  const roomId = a.room.id;
  assert.deepEqual((await state.read("A", roomId)).toolProgression, INITIAL_TOOL_PROGRESSION);
  await db.prepare("UPDATE family_state SET inventories_json = ? WHERE room_id = ?")
    .bind(JSON.stringify({ [a.room.playerId]: { items: { wood: 3 }, toolProgression: { axe: 2, pickaxe: 1 } } }), roomId).run();
  const before = await state.read("A", roomId);
  await state.act("A", roomId, before.revision, { kind: "sell", pose: { mapId: "farm", x: 224, y: 256, facing: "down", selectedTool: "hand", moving: false } });
  assert.deepEqual((await state.read("A", roomId)).toolProgression, { axe: 2, pickaxe: 1 }, "기존 family action 후 개인 단계 보존");
  assert.deepEqual((await state.read("B", roomId)).toolProgression, INITIAL_TOOL_PROGRESSION, "B 개인 단계는 별개");
} finally { close(); }
console.log("Tool progression: definitions, legacy save defaults and private family persistence passed");
