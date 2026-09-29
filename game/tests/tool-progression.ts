import { strict as assert } from "node:assert";
import { Inventory, normalizeSaveData } from "../domain";
import { INITIAL_TOOL_PROGRESSION, TOOL_LEVELS, TOOL_UPGRADES } from "../tools/definitions";
import { normalizeToolProgression, toolPower, upgradeTool } from "../tools/progression";
import { ITEM_DEFINITIONS } from "../data/items";
import { FamilyRooms } from "../../server/family/rooms";
import { FamilyState } from "../../server/family/state";
import { familyTestDB } from "./family-db";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CraftingPanel } from "../../app/components/CraftingPanel";
import { readFileSync } from "node:fs";

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
const icon = readFileSync("public/assets/items/pickaxe.png");
assert.deepEqual([...icon.subarray(16, 24)], [0, 0, 0, 32, 0, 0, 0, 32], "곡괭이 아이콘 32×32");
const upgraded = normalizeToolProgression(null), supplies = new Inventory({ items: { wood_plank: 5, stone_block: 3 } });
assert.ok(upgradeTool(supplies, upgraded, TOOL_UPGRADES.pickaxe_unlock));
assert.deepEqual(upgraded, { axe: 1, pickaxe: 1 });
assert.equal(supplies.count("wood_plank"), 3); assert.equal(supplies.count("stone_block"), 2);
assert.equal(upgradeTool(supplies, upgraded, TOOL_UPGRADES.pickaxe_unlock), false, "중복 해금 거부");
assert.ok(upgradeTool(supplies, upgraded, TOOL_UPGRADES.axe_2));
assert.deepEqual(upgraded, { axe: 2, pickaxe: 1 });
assert.equal(supplies.count("wood_plank"), 0); assert.equal(supplies.count("stone_block"), 0);
assert.equal(upgradeTool(supplies, upgraded, TOOL_UPGRADES.axe_2), false, "중복 강화 거부");
const panel = renderToStaticMarkup(createElement(CraftingPanel, { items: { wood_plank: 2, stone_block: 1 }, busy: false, onCraft() {}, onUpgrade() {}, onClose() {} }));
assert.ok(panel.includes("곡괭이 해금") && panel.includes("해금·강화") && panel.includes("곡괭이") && panel.includes("보유 2 / 필요 2") && panel.includes("도끼") && panel.includes("잠김"));

const { db, close } = familyTestDB();
try {
  const rooms = new FamilyRooms(db, () => 1000), state = new FamilyState(db, () => 1000);
  const a = await rooms.create("A", "도구 기록", "지우");
  const b = await rooms.join("B", a.room.inviteCode, "수빈");
  const roomId = a.room.id;
  assert.deepEqual((await state.read("A", roomId)).toolProgression, INITIAL_TOOL_PROGRESSION);
  await db.prepare("UPDATE family_state SET inventories_json = ? WHERE room_id = ?")
    .bind(JSON.stringify({ [a.room.playerId]: { items: { wood: 3 }, toolProgression: { axe: 2, pickaxe: 1 } } }), roomId).run();
  const before = await state.read("A", roomId);
  await state.act("A", roomId, before.revision, { kind: "sell", pose: { mapId: "farm", x: 224, y: 256, facing: "down", selectedTool: "hand", moving: false } });
  assert.deepEqual((await state.read("A", roomId)).toolProgression, { axe: 2, pickaxe: 1 }, "기존 family action 후 개인 단계 보존");
  assert.deepEqual((await state.read("B", roomId)).toolProgression, INITIAL_TOOL_PROGRESSION, "B 개인 단계는 별개");
  const pose = { mapId: "farmhouse", x: 384, y: 249, facing: "up", selectedTool: "hand", moving: false } as const;
  await db.prepare("UPDATE family_state SET inventories_json = ? WHERE room_id = ?")
    .bind(JSON.stringify({ [a.room.playerId]: { items: { wood_plank: 5, stone_block: 3 } }, [b.room.playerId]: { items: { wood_plank: 7, stone_block: 4 } } }), roomId).run();
  const start = await state.read("A", roomId);
  const unlock = { kind: "tool-upgrade", upgradeId: "pickaxe_unlock", pose };
  const raced = await Promise.allSettled([state.act("A", roomId, start.revision, unlock), state.act("A", roomId, start.revision, unlock)]);
  assert.equal(raced.filter(result => result.status === "fulfilled").length, 1, "중복 요청 한 번만 승인");
  const stale = raced.find(result => result.status === "rejected") as PromiseRejectedResult;
  assert.ok(stale.reason.status === 409 && stale.reason.details.snapshot, "stale revision 최신 snapshot");
  const after = await state.read("A", roomId);
  assert.equal(after.toolProgression?.pickaxe, 1);
  assert.equal(after.inventory.items.wood_plank, 3); assert.equal(after.inventory.items.stone_block, 2);
  assert.equal((await state.read("B", roomId)).toolProgression?.pickaxe, 0, "B 도구는 미변경");
  assert.equal((await state.read("B", roomId)).inventory.items.wood_plank, 7);
  const level2 = await state.act("A", roomId, after.revision, { kind: "tool-upgrade", upgradeId: "axe_2", pose, tool: "pickaxe", toLevel: 99, power: 900, materials: [] });
  assert.deepEqual(level2.toolProgression, { axe: 2, pickaxe: 1 }, "클라이언트 도구/레벨/성능을 무시");
  assert.equal(level2.inventory.items.wood_plank, 0); assert.equal(level2.inventory.items.stone_block, 0);
  const invalid = async (candidate: unknown, status: number) => {
    const previous = await state.read("A", roomId);
    await assert.rejects(state.act("A", roomId, previous.revision, candidate), (e: unknown) => e instanceof Error && (e as {status?: number}).status === status);
    assert.deepEqual(await state.read("A", roomId), previous);
  };
  await invalid(unlock, 409);
  await invalid({ kind: "tool-upgrade", upgradeId: "axe_2", pose }, 409);
  await invalid({ kind: "tool-upgrade", upgradeId: "unknown", pose }, 400);
  await invalid({ kind: "tool-upgrade", upgradeId: "axe_2", pose: { ...pose, x: 0, y: 0 } }, 400);
} finally { close(); }
console.log("Tool progression: definitions, legacy save defaults and private family persistence passed");
