import { strict as assert } from "node:assert";
import { PLAYER_ASSET, displayedSize, physicsBoxForScale } from "../assets/definitions";
import { CROP_DEFINITIONS } from "../data/crops";
import { Inventory, LocalStorageSaveRepository, advanceFarmDay, purchaseInventoryItem, type FarmTileData, type SaveData } from "../domain";
import { GENERAL_STORE_LISTINGS } from "../data/shop";
import { GAME_CONFIG } from "../config";
import { MAP_DEFINITIONS, TILE_TYPE_DEFINITIONS, getTileTypeAt } from "../maps/definitions";

const storage = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", { value: {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
} });

const tile: FarmTileData = { x: 9, y: 8, tilled: true, wateredToday: false, cropType: "sproutberry", cropStage: 0, plantedDay: 1 };
for (let day = 0; day < CROP_DEFINITIONS.sproutberry.growthDays; day += 1) {
  tile.wateredToday = true;
  advanceFarmDay([tile]);
  assert.equal(tile.wateredToday, false, "다음 날 물 상태가 초기화되어야 함");
}
assert.equal(tile.cropStage, 3, "3일 물을 주면 수확 단계여야 함");

const inventory = new Inventory();
assert.equal(inventory.consume("sproutberry_seed"), true);
inventory.add("sproutberry");
assert.deepEqual(inventory.sellAll("sproutberry", CROP_DEFINITIONS.sproutberry.sellPrice), { amount: 1, earned: 35 });
const listing = GENERAL_STORE_LISTINGS[0];
const seedsBeforePurchase = inventory.count(listing.itemId);
const purchase = purchaseInventoryItem(inventory, 120, listing.itemId, listing.price, listing.quantity);
assert.deepEqual(purchase, { purchased: true, money: 100 });
assert.equal(inventory.count(listing.itemId), seedsBeforePurchase + 1, "구매 시 돈을 차감하고 씨앗을 늘려야 함");
assert.deepEqual(purchaseInventoryItem(inventory, 0, listing.itemId, listing.price), { purchased: false, money: 0 });

const save: SaveData = {
  version: 4, day: 3, timeMinutes: 560, money: 435, selectedTool: "water",
  player: { x: 224, y: 256, facing: "down", mapId: "town" }, inventory: inventory.serialize(), farm: [tile], savedAt: 123,
};
const repository = new LocalStorageSaveRepository();
repository.save(save);
assert.deepEqual(repository.load(), save, "날짜·시간·농장·인벤토리·돈·위치를 동일하게 복원해야 함");

storage.clear();
storage.set("jiwoos-farm.save.v2", JSON.stringify({
  version: 2, day: 2, timeMinutes: 420, money: 200, selectedTool: "hoe",
  player: { x: 200, y: 220, facing: "left" }, inventory: { seeds: 6, harvest: 2 }, farm: [tile], savedAt: 99,
}));
const migrated = repository.load();
assert.equal(migrated?.version, 4, "기존 0.2 저장은 새 저장 형식으로 이전되어야 함");
assert.equal(migrated?.player.mapId, "farm", "기존 저장은 농장 맵에서 시작해야 함");
assert.equal(migrated?.inventory.items.sproutberry_seed, 6);
assert.equal(migrated?.inventory.items.sproutberry, 2);

const requiredAnimations = [
  "idle_down", "idle_up", "idle_left", "idle_right", "walk_down", "walk_up", "walk_left", "walk_right",
  "tool_down", "tool_up", "tool_left", "tool_right",
];
assert.deepEqual(Object.keys(PLAYER_ASSET.animations), requiredAnimations);
const scaledPlayer = { ...PLAYER_ASSET, displayScale: { x: 2, y: 1.5 } };
assert.deepEqual(displayedSize(scaledPlayer), { width: 64, height: 54 }, "scale 변경은 표현 크기에만 반영되어야 함");
const compensatedBox = physicsBoxForScale(PLAYER_ASSET.collisionBox, scaledPlayer.displayScale);
assert.equal(compensatedBox.width * scaledPlayer.displayScale.x, PLAYER_ASSET.collisionBox.width, "시각 배율이 충돌 폭을 바꾸면 안 됨");
assert.equal(compensatedBox.height * scaledPlayer.displayScale.y, PLAYER_ASSET.collisionBox.height, "시각 배율이 충돌 높이를 바꾸면 안 됨");
assert.equal(GAME_CONFIG.playerSpeed, 145, "에셋 scale 변경이 이동 속도 설정에 영향을 주면 안 됨");
assert.equal(TILE_TYPE_DEFINITIONS[getTileTypeAt("farm", 9, 8)].farmable, true);
assert.equal(TILE_TYPE_DEFINITIONS[getTileTypeAt("farm", 27, 18)].walkable, false);
assert.deepEqual(Object.keys(MAP_DEFINITIONS), ["farm", "farmhouse", "road", "town", "general_store"]);
for (const map of Object.values(MAP_DEFINITIONS)) {
  for (const warp of map.warps) {
    assert.ok(MAP_DEFINITIONS[warp.targetMapId], `${map.id}.${warp.id} 목적지 맵이 존재해야 함`);
    assert.ok(MAP_DEFINITIONS[warp.targetMapId].spawns.some((spawn) => spawn.id === warp.targetSpawnId), `${map.id}.${warp.id} 목적지 스폰이 존재해야 함`);
  }
}

console.log("0.3 world, save migration, farming, and asset-swap regression checks: passed");
