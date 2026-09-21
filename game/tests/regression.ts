import { strict as assert } from "node:assert";
import { CROP_ASSETS, ITEM_ASSETS, PLAYER_ASSET, TILE_ASSETS, WORLD_OBJECT_ASSETS, displayedSize, physicsBoxForScale } from "../assets/definitions";
import { CROP_DEFINITIONS } from "../data/crops";
import { Inventory, LocalStorageSaveRepository, advanceFarmDay, normalizeSaveData, purchaseInventoryItem, type FarmTileData, type SaveData } from "../domain";
import { GENERAL_STORE_LISTINGS } from "../data/shop";
import { ITEM_DEFINITIONS } from "../data/items";
import { GAME_CONFIG } from "../config";
import { MAP_DEFINITIONS, TILE_TYPE_DEFINITIONS, getTileTypeAt, tilePoint } from "../maps/definitions";
import { collisionRectCenter } from "../rendering/WorldRenderer";
import { ToolActionSystem } from "../actions/ToolActionSystem";
import { cloneEditorDocument, createBuiltInEditorDocument, documentToRegistry, LocalMapEditorRepository, parseEditorDocument, touchEditorDocument } from "../editor/document";
import { EditorHistory } from "../editor/history";
import { validateEditorDocument } from "../editor/validation";
import { MapRegistry } from "../maps/MapRegistry";
import { facingFromMovement, mergeMovementInput, normalizeMovement } from "../input/MovementInput";
import { compareDraftFreshness, shouldAdoptCloudDraft } from "../editor/sync";
import { createPinchStart, updatePinchViewport } from "../editor/viewport";

const storage = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", { value: {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
} });

const tile: FarmTileData = { x: 9, y: 8, tilled: true, wateredToday: false, cropType: "sproutberry", cropStage: 0, plantedDay: 1 };
const diagonal = normalizeMovement({ x: 1, y: 1 });
assert.ok(Math.abs(Math.hypot(diagonal.x, diagonal.y) - 1) < 1e-12, "대각선 이동 속도는 정규화되어야 함");
assert.deepEqual(mergeMovementInput({ x: 1, y: 0 }, { x: 0, y: -1 }), { x: 0, y: -1 }, "가상 조이스틱 입력은 공통 이동 입력으로 합쳐져야 함");
assert.equal(facingFromMovement({ x: -.8, y: -.2 }, "down"), "left");
assert.equal(compareDraftFreshness(100, 200), "cloud-newer", "서버 updatedAt이 최신이면 충돌 안내가 필요함");
assert.equal(compareDraftFreshness(300, 200), "local-newer", "오프라인 로컬 편집은 다음 연결 때 업로드 대상이어야 함");
assert.equal(shouldAdoptCloudDraft(false, 300, 200), true, "새 기기의 임시 기본 문서보다 기존 클라우드 초안을 우선해야 함");
assert.equal(shouldAdoptCloudDraft(true, 300, 200), false, "실제 로컬 초안이 더 최신이면 자동으로 덮어쓰면 안 됨");
const pinchStart = createPinchStart({ x: 40, y: 50 }, { x: 80, y: 50 }, { zoom: 1, panX: 0, panY: 0 });
assert.deepEqual(updatePinchViewport(pinchStart, { x: 20, y: 65 }, { x: 100, y: 65 }), { zoom: 2, panX: 0, panY: 15 }, "두 손가락 간격과 중심 이동이 zoom/pan에 함께 반영되어야 함");
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

storage.clear();
storage.set("jiwoos-farm.save.v4", JSON.stringify({
  version: 4, day: -8, timeMinutes: "broken", money: -50, selectedTool: "axe",
  player: { x: "NaN", y: null, facing: "sideways", mapId: "deleted_map" },
  inventory: { items: { sproutberry_seed: 3, unknown_item: 99 } },
  farm: [{ x: 9, y: 8, tilled: true, wateredToday: true, cropType: "missing_crop", cropStage: 99 }],
}));
const recovered = repository.load();
const farmSpawn = MAP_DEFINITIONS.farm.spawns[0];
assert.equal(recovered?.player.mapId, "farm", "삭제되거나 이름이 바뀐 맵은 farm으로 복구해야 함");
assert.deepEqual(recovered?.player, { ...tilePoint(farmSpawn.tileX, farmSpawn.tileY), facing: farmSpawn.facing, mapId: "farm" });
assert.equal(recovered?.day, 1);
assert.equal(recovered?.timeMinutes, GAME_CONFIG.day.startMinutes);
assert.equal(recovered?.money, GAME_CONFIG.startingMoney);
assert.equal(recovered?.farm[0].cropType, null, "알 수 없는 작물은 빈 타일로 안전하게 복구해야 함");
assert.equal(recovered?.inventory.items.sproutberry_seed, 3);
assert.equal("unknown_item" in (recovered?.inventory.items ?? {}), false);
assert.equal(normalizeSaveData({ version: 99 }), null, "지원하지 않는 버전은 새 게임으로 처리해야 함");

storage.clear();
storage.set("jiwoos-farm.save.v4", "{ malformed");
storage.set("jiwoos-farm.save.v3", JSON.stringify({ ...save, version: 3, player: { x: 120, y: 140, facing: "left" } }));
assert.equal(repository.load()?.version, 4, "손상된 최신 저장 뒤에 복구 가능한 이전 저장이 있으면 사용해야 함");

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
  assert.ok(TILE_TYPE_DEFINITIONS[map.baseTileType], `${map.id} 기본 타일 종류가 존재해야 함`);
  for (const region of map.terrainRegions) assert.ok(TILE_TYPE_DEFINITIONS[region.tileType], `${map.id} 지형 타일 종류가 존재해야 함`);
  for (const object of map.objects) assert.ok(WORLD_OBJECT_ASSETS[object.assetId], `${map.id}.${object.id} asset이 존재해야 함`);
  for (const warp of map.warps) {
    assert.ok(MAP_DEFINITIONS[warp.targetMapId], `${map.id}.${warp.id} 목적지 맵이 존재해야 함`);
    assert.ok(MAP_DEFINITIONS[warp.targetMapId].spawns.some((spawn) => spawn.id === warp.targetSpawnId), `${map.id}.${warp.id} 목적지 스폰이 존재해야 함`);
  }
}

for (const crop of Object.values(CROP_DEFINITIONS)) {
  assert.ok(ITEM_DEFINITIONS[crop.seedItemId], `${crop.id} 씨앗 아이템이 존재해야 함`);
  assert.ok(ITEM_DEFINITIONS[crop.harvestItemId], `${crop.id} 수확 아이템이 존재해야 함`);
  let previousGrowthDay = -1;
  for (const stage of crop.stages) {
    assert.ok(CROP_ASSETS[stage.assetId], `${crop.id}.${stage.id} stage asset이 존재해야 함`);
    assert.ok(stage.growthDay >= previousGrowthDay, `${crop.id} growthDay가 오름차순이어야 함`);
    previousGrowthDay = stage.growthDay;
  }
}
for (const listingEntry of GENERAL_STORE_LISTINGS) {
  assert.ok(ITEM_DEFINITIONS[listingEntry.itemId], `${listingEntry.id} 상점 아이템이 존재해야 함`);
  assert.ok(listingEntry.price >= 0, `${listingEntry.id} 가격이 음수가 아니어야 함`);
  assert.ok(listingEntry.quantity >= 1, `${listingEntry.id} 수량이 1 이상이어야 함`);
}
for (const tileType of Object.values(TILE_TYPE_DEFINITIONS)) assert.ok(TILE_ASSETS[tileType.graphicAssetId], `${tileType.graphicAssetId} tile asset이 존재해야 함`);
for (const item of Object.values(ITEM_DEFINITIONS)) assert.ok(ITEM_ASSETS[item.assetId], `${item.id} icon asset이 존재해야 함`);

const house = MAP_DEFINITIONS.farm.objects.find((object) => object.id === "house")!;
const basket = MAP_DEFINITIONS.farm.objects.find((object) => object.id === "sell_basket")!;
assert.deepEqual(collisionRectCenter(tilePoint(house.position.tileX, house.position.tileY), house.collision!), { x: 160, y: 147.5 });
assert.deepEqual(collisionRectCenter(tilePoint(basket.position.tileX, basket.position.tileY), basket.collision!), { x: 1056, y: 240 });

let now = 1_000;
let effects = 0;
const toolActions = new ToolActionSystem({ playTool: () => undefined }, () => now);
assert.equal(toolActions.execute("hoe", "down", () => { effects += 1; }), true);
assert.equal(toolActions.execute("hoe", "down", () => { effects += 1; }), false, "한 animation 중 중복 행동을 막아야 함");
now += GAME_CONFIG.toolActionCooldownMs;
assert.equal(toolActions.execute("hoe", "down", () => { effects += 1; }), true);
assert.equal(effects, 2);

const editorDocument = createBuiltInEditorDocument();
assert.deepEqual(validateEditorDocument(editorDocument), [], "기본 맵은 편집기 schema/참조 검증을 통과해야 함");
const editorRepository = new LocalMapEditorRepository();
editorDocument.maps.find((map) => map.id === "town")!.name = "테스트 햇살마을";
editorRepository.save(editorDocument);
assert.equal(editorRepository.load()?.maps.find((map) => map.id === "town")?.name, "테스트 햇살마을", "게임 저장과 별도 key로 편집 문서를 복원해야 함");
assert.equal(editorRepository.load()?.updatedAt, editorDocument.updatedAt, "로컬 저장 자체가 콘텐츠 수정 시각을 바꾸면 안 됨");
const previousEditorUpdatedAt = editorDocument.updatedAt;
touchEditorDocument(editorDocument, previousEditorUpdatedAt);
assert.equal(editorDocument.updatedAt, previousEditorUpdatedAt + 1, "연속 편집도 항상 더 최신 문서 시각을 가져야 함");
assert.ok(storage.has(LocalMapEditorRepository.key));
const registry = new MapRegistry();
registry.replace(documentToRegistry(editorDocument));
assert.equal(registry.require("town").name, "테스트 햇살마을", "working copy를 runtime registry에 적용해야 함");
registry.require("town").name = "runtime only";
assert.equal(MAP_DEFINITIONS.town.name, "햇살마을", "runtime 편집이 내장 맵 상수를 변경하면 안 됨");

const history = new EditorHistory(cloneEditorDocument, 3);
const beforeEdit = cloneEditorDocument(editorDocument);
history.push(beforeEdit);
editorDocument.maps[0].name = "변경";
const undone = history.undo(editorDocument)!;
assert.equal(undone.maps[0].name, beforeEdit.maps[0].name);
assert.equal(history.redo(undone)?.maps[0].name, "변경");

const brokenEditor = cloneEditorDocument(editorDocument);
brokenEditor.maps.push(structuredClone(brokenEditor.maps[0]));
brokenEditor.maps[0].objects.push({ id: "missing", assetId: "not_registered" as never, position: { tileX: 2, tileY: 2 } });
brokenEditor.maps[0].warps.push({ id: "broken", area: { startX: 0, endX: 0, startY: 0, endY: 0 }, targetMapId: "missing_map", targetSpawnId: "missing" });
const editorIssues = validateEditorDocument(brokenEditor);
assert.ok(editorIssues.some((issue) => issue.message.includes("중복된 맵 ID")));
assert.ok(editorIssues.some((issue) => issue.message.includes("등록되지 않은 에셋")));
assert.ok(editorIssues.some((issue) => issue.message.includes("목적지 맵")));
assert.equal(parseEditorDocument({ editorVersion: 99, maps: [] }).document, null, "잘못된 Import는 적용하지 않아야 함");
assert.doesNotThrow(() => validateEditorDocument({ editorVersion: 1, maps: [{ id: "bad", width: 20, height: 10, warps: [null] }] }), "손상된 문서 검증이 crash하면 안 됨");
const importedRoundTrip = parseEditorDocument(JSON.parse(JSON.stringify(editorDocument))).document;
assert.deepEqual(importedRoundTrip, editorDocument, "Export한 Editor Document를 validation 후 동일하게 Import해야 함");
assert.equal(createBuiltInEditorDocument().maps.find((map) => map.id === "town")?.name, "햇살마을", "기본값 초기화는 내장 맵의 새 사본을 만들어야 함");

console.log("0.4 mobile input, editor viewport/cloud sync, world, save migration, farming, and asset-swap regression checks: passed");
