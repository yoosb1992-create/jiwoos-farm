import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { InventoryPanel } from "../../app/components/InventoryPanel";
import { SinglePlayerMenu, StaminaMeter } from "../../app/page";
import { consumeFood, FOOD_DEFINITIONS } from "../data/food";
import { Inventory, normalizeSaveData } from "../domain";
import { applyFarmToolEffect } from "../farm/toolBehavior";
import type { FamilyPose } from "../family/types";
import { initialPlayerStats, recordSuccessfulAction } from "../player/stats";
import { initialStorage, normalizeStorage, starterStorage, transferItem } from "../storage/container";
import { initialWateringCan } from "../tools/wateringCan";
import { normalizeToolProgression } from "../tools/progression";
import { FamilyRooms } from "../../server/family/rooms";
import { FamilyState } from "../../server/family/state";
import { familyTestDB } from "./family-db";

assert.equal(FOOD_DEFINITIONS.stamina_biscuit.staminaRestore, 25);
const noFood = new Inventory({ items: {} }), stats = { ...initialPlayerStats(), stamina: 50 };
assert.deepEqual(consumeFood(noFood, stats, "stamina_biscuit"), { consumed: false, restoredAmount: 0, message: "스테미나 비스켓이 없어요." });

const bag = new Inventory({ items: { stamina_biscuit: 3 } });
assert.equal(consumeFood(bag, stats, "stamina_biscuit").restoredAmount, 25);
assert.deepEqual([stats.stamina, bag.count("stamina_biscuit")], [75, 2]);
stats.stamina = 90;
assert.equal(consumeFood(bag, stats, "stamina_biscuit").restoredAmount, 10);
assert.deepEqual([stats.stamina, bag.count("stamina_biscuit")], [100, 1]);
assert.equal(consumeFood(bag, stats, "stamina_biscuit").consumed, false);
assert.equal(bag.count("stamina_biscuit"), 1, "full stamina must not consume food");
const foodSave = normalizeSaveData(JSON.parse(JSON.stringify({
  version: 4, day: 1, daySerial: 1, timeMinutes: 360, money: 100, selectedTool: "hand",
  player: { mapId: "farm", x: 304, y: 224, facing: "down" }, inventory: bag.serialize(), stats,
  farm: [], savedAt: 1,
})))!;
assert.deepEqual([foodSave.inventory.items.stamina_biscuit, foodSave.stats?.stamina], [1, 100], "food count and stamina survive save normalization");

const empty = initialStorage(), starter = starterStorage();
assert.deepEqual(empty.containers.family_chest.items, {}, "normalization storage stays empty");
assert.equal(starter.containers.family_chest.items.stamina_biscuit, 99);
const starterBag = new Inventory({ items: {} });
assert.equal(transferItem(starterBag, starter, "family_chest", "withdraw", "stamina_biscuit", 1), null);
assert.equal(normalizeStorage(starter).containers.family_chest.items.stamina_biscuit, 98, "normalization must not resurrect starter food");

const hoeStats = initialPlayerStats();
const tile = { x: 9, y: 8, tilled: false, wateredToday: false, cropType: null, cropStage: null, plantedDay: null };
assert.equal(applyFarmToolEffect("hoe", tile, { selectedCrop: "sproutberry", inventory: new Inventory(), stats: hoeStats, wateringCan: initialWateringCan(), toolProgression: normalizeToolProgression(undefined), day: 1, raining: false }).changed, true);
assert.ok(hoeStats.stamina < hoeStats.maxStamina);
const afterHoe = renderToStaticMarkup(createElement(StaminaMeter, { stamina: hoeStats.stamina, maxStamina: hoeStats.maxStamina }));
assert.ok(afterHoe.includes(`스테미나 ${hoeStats.stamina} / ${hoeStats.maxStamina}`));
const beforeWater = hoeStats.stamina;
assert.equal(applyFarmToolEffect("water", tile, { selectedCrop: "sproutberry", inventory: new Inventory(), stats: hoeStats, wateringCan: initialWateringCan(), toolProgression: normalizeToolProgression(undefined), day: 1, raining: false }).changed, true);
assert.ok(hoeStats.stamina < beforeWater);
const actionStats = initialPlayerStats();
recordSuccessfulAction(actionStats, "axe"); recordSuccessfulAction(actionStats, "pickaxe"); recordSuccessfulAction(actionStats, "forage");
assert.ok(actionStats.stamina < actionStats.maxStamina);
actionStats.stamina = 0;
assert.equal(recordSuccessfulAction(actionStats, "hoe"), false);

const fullMeter = renderToStaticMarkup(createElement(StaminaMeter, { stamina: 100, maxStamina: 100 }));
const emptyMeter = renderToStaticMarkup(createElement(StaminaMeter, { stamina: 0, maxStamina: 100 }));
assert.ok(fullMeter.includes("스테미나 100 / 100") && fullMeter.includes("width:100%"));
assert.ok(emptyMeter.includes("low") && emptyMeter.includes("width:0%"));
const inventoryMarkup = renderToStaticMarkup(createElement(InventoryPanel, { items: { stamina_biscuit: 2 }, stats: initialPlayerStats(), onConsume: () => {}, onClose: () => {} }));
assert.ok(inventoryMarkup.includes("스테미나 비스켓") && inventoryMarkup.includes("먹기"));
const noSaveMenu = renderToStaticMarkup(createElement(SinglePlayerMenu, { hasSave: false, onNew: () => {}, onContinue: () => {}, onBack: () => {} }));
const savedMenu = renderToStaticMarkup(createElement(SinglePlayerMenu, { hasSave: true, onNew: () => {}, onContinue: () => {}, onBack: () => {} }));
assert.ok(noSaveMenu.includes("처음부터") && noSaveMenu.includes("이어서 하기") && noSaveMenu.includes("저장된 게임이 없습니다.") && noSaveMenu.includes("disabled"));
assert.ok(savedMenu.includes("최근 저장한 혼자하기 농장 불러오기") && !savedMenu.includes("disabled"));
const sceneSource = readFileSync(new URL("../FarmScene.ts", import.meta.url), "utf8");
assert.ok(sceneSource.includes("this.storage = starterStorage()"), "fresh single play receives starter storage exactly once");

const { db, close } = familyTestDB();
try {
  const rooms = new FamilyRooms(db, () => 100_000), state = new FamilyState(db, () => 100_000);
  const a = await rooms.create("food-A", "비스켓 농장", "A");
  const b = await rooms.join("food-B", a.room.inviteCode, "B");
  const roomId = a.room.id;
  const initial = await state.read("food-A", roomId);
  assert.equal(initial.world.storage?.containers.family_chest.items.stamina_biscuit, 99, "new Family world starter chest");
  const pose: FamilyPose = { mapId: "farmhouse", x: 96, y: 160, facing: "up", selectedTool: "hand", moving: false };
  const withdrawn = await state.act("food-A", roomId, initial.revision, { kind: "storage", containerId: "family_chest", direction: "withdraw", itemId: "stamina_biscuit", quantity: 1, pose });
  assert.deepEqual([withdrawn.inventory.items.stamina_biscuit, withdrawn.world.storage?.containers.family_chest.items.stamina_biscuit], [1, 98]);
  await db.prepare("UPDATE family_state SET inventories_json=? WHERE room_id=?").bind(JSON.stringify({
    [a.room.playerId]: { ...withdrawn.inventory, stats: { ...initialPlayerStats(), stamina: 50 } },
    [b.room.playerId]: { items: {}, stats: { ...initialPlayerStats(), stamina: 80 } },
  }), roomId).run();
  const eaten = await state.act("food-A", roomId, withdrawn.revision, { kind: "consume-food", itemId: "stamina_biscuit", pose });
  assert.deepEqual([eaten.stats?.stamina, eaten.inventory.items.stamina_biscuit], [75, 0]);
  const other = await state.read("food-B", roomId);
  assert.equal(other.stats?.stamina, 80); assert.equal(other.inventory.items.stamina_biscuit ?? 0, 0);
  assert.equal(other.world.storage?.containers.family_chest.items.stamina_biscuit, 98, "existing room does not receive starter food again");
  await assert.rejects(state.act("food-A", roomId, eaten.revision, { kind: "consume-food", itemId: "stamina_biscuit", pose }));
} finally { close(); }

console.log("Stamina/Food/New Game: HUD, food rules, starter isolation, menus and Family authority passed");
