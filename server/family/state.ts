import { FAMILY_PRESENCE_TTL_MS } from "../../game/family/presence";
import { GAME_CONFIG } from "../../game/config";
import { calendarDate, worldMinute } from "../../game/world/calendar";
import { waterFarmForRain, weatherFor } from "../../game/weather/system";
import { advanceFarmDay, Inventory, purchaseInventoryItem, type InventoryData } from "../../game/domain";
import { sellMarketGoods } from "../../game/economy/sales";
import { beginFishing, fishingSpotError, normalizeFishingCast, normalizeFishingProgress, reelFishing } from "../../game/fishing/system";
import type { FishingCast, FishingProgress } from "../../game/fishing/types";
import { DEFAULT_CROP_ID, isCropId, getCropDefinition, isMatureCrop } from "../../game/data/crops";
import { GENERAL_STORE_LISTINGS } from "../../game/data/shop";
import { MAP_DEFINITIONS, pointInTileRect } from "../../game/maps/definitions";
import { parseFamilyPose } from "../../game/family/personal";
import { interactionTargetPointFromPosition, playerFeetPointFromPosition } from "../../game/player/interaction";
import type { FamilyAction, FamilySnapshot, FamilyWorld } from "../../game/family/types";
import { getRecipe } from "../../game/crafting/definitions";
import { craft } from "../../game/crafting/engine";
import { normalizeToolProgression } from "../../game/tools/progression";
import { upgradeTool } from "../../game/tools/progression";
import { getToolUpgrade } from "../../game/tools/definitions";
import type { ToolProgression } from "../../game/tools/types";
import { canPerformAction, normalizePlayerStats, recordSuccessfulAction, restoreStamina, type PlayerStats } from "../../game/player/stats";
import { initialStorage, normalizeStorage, transferItem } from "../../game/storage/container";
import { initialPlaceables, normalizePlaceables, placeObject, removeObject } from "../../game/placeables/system";
import { startMachine, collectMachine } from "../../game/machines/system";
import { constructBuilding, initialBuildings, normalizeBuildings } from "../../game/buildings/system";
import { BUILDING_DEFINITIONS } from "../../game/buildings/definitions";
import { FARM_EXPANSIONS, initialFarmProgress, normalizeFarmProgress, unlockExpansion } from "../../game/farm/expansions";
import { FamilyError, FamilyRooms } from "./rooms";
import { emptyForestState, FOREST_RESOURCES, generateResourceForest, normalizeForestState, resourceKind, strikeForestNode, validForestNodeId } from "../../game/forest/resources";
import { generateMineFloor, MINE_PLAYABLE_FLOORS, mineMapId } from "../../game/mine/generation";
import { emptyMineDaily, initialMineProgress, mineResourceKind, normalizeMineDaily, normalizeMineProgress, strikeMineNode } from "../../game/mine/resources";
import { advanceRanchDay, buyAnimal, collectAnimalProduce, feedCoop, initialRanchState, normalizeRanchState, petAnimal } from "../../game/animals/system";

interface StoredWorld extends FamilyWorld { clockAnchor: number; sleepVotes?: string[]; sleepSessions?: Record<string, string> }
interface StateRow { revision: number; world_json: string; inventories_json: string }
type FamilyInventory = InventoryData & { toolProgression?: ToolProgression; stats?: PlayerStats; fishingProgress?: FishingProgress; fishingCast?: FishingCast | null };
export const initialFamilyWorld = (now: number): StoredWorld => ({
  day: 1, daySerial: 1, timeMinutes: GAME_CONFIG.day.startMinutes, clockAnchor: now, money: GAME_CONFIG.startingMoney,
  forestState: emptyForestState(1),
  mineProgress: initialMineProgress(), mineDaily: emptyMineDaily(1),
  storage: initialStorage(),
  placeables: initialPlaceables(),
  buildings: initialBuildings(), farmProgress: initialFarmProgress(),
  ranchState: initialRanchState(),
  farm: MAP_DEFINITIONS.farm.farmAreas.flatMap((area) => Array.from({ length: area.endY - area.startY + 1 }, (_, j) =>
    Array.from({ length: area.endX - area.startX + 1 }, (_, i) => ({ x: area.startX + i, y: area.startY + j, tilled: false, wateredToday: false, cropType: null, cropStage: null, plantedDay: null }))).flat()),
});
function currentWorld(stored: StoredWorld, now: number, roomId: string): FamilyWorld {
  // Older room JSON has no weather field; derive rain for the current day on read.
  waterFarmForRain(stored.farm, weatherFor(roomId, stored.daySerial ?? stored.day));
  const timeMinutes = Math.min(GAME_CONFIG.day.endMinutes, stored.timeMinutes + Math.floor(Math.max(0, now - stored.clockAnchor) / GAME_CONFIG.day.realMsPerGameMinute));
  const buildings = normalizeBuildings(stored.buildings, stored.daySerial ?? stored.day);
  return { day: calendarDate(stored.daySerial ?? stored.day).day, daySerial: stored.daySerial ?? stored.day, forestState: normalizeForestState(stored.forestState, stored.daySerial ?? stored.day), mineProgress: normalizeMineProgress(stored.mineProgress), mineDaily: normalizeMineDaily(stored.mineDaily, stored.daySerial ?? stored.day, roomId), storage: normalizeStorage(stored.storage), placeables: normalizePlaceables(stored.placeables, worldMinute(stored.daySerial ?? stored.day, timeMinutes)), buildings, ranchState: normalizeRanchState(stored.ranchState, buildings), farmProgress: normalizeFarmProgress(stored.farmProgress), money: stored.money, farm: stored.farm,
    timeMinutes };
}
export class FamilyState extends FamilyRooms {
  private async row(roomId: string): Promise<StateRow> {
    await this.db.prepare("INSERT OR IGNORE INTO family_state (room_id, revision, world_json, inventories_json, updated_at) VALUES (?, 0, ?, '{}', ?)")
      .bind(roomId, JSON.stringify(initialFamilyWorld(this.now())), this.now()).run();
    const row = await this.db.prepare("SELECT revision, world_json, inventories_json FROM family_state WHERE room_id = ?").bind(roomId).first<StateRow>();
    if (!row) throw new FamilyError(503, "공유 상태를 읽을 수 없습니다.");
    return row;
  }
  private snapshot(row: StateRow, playerId: string, roomId: string): FamilySnapshot {
    const inventories = JSON.parse(row.inventories_json) as Record<string, FamilyInventory>;
    const clock = JSON.parse(row.world_json) as StoredWorld;
    return { npcTimeMinutes: Math.min(GAME_CONFIG.day.endMinutes, clock.timeMinutes + Math.max(0, this.now()-clock.clockAnchor)/GAME_CONFIG.day.realMsPerGameMinute), revision: row.revision, serverNow: this.now(), world: currentWorld(JSON.parse(row.world_json), this.now(), roomId), inventory: inventories[playerId] ?? new Inventory().serialize(), toolProgression: normalizeToolProgression(inventories[playerId]?.toolProgression), stats: normalizePlayerStats(inventories[playerId]?.stats), fishingProgress: normalizeFishingProgress(inventories[playerId]?.fishingProgress), fishingCast: normalizeFishingCast(inventories[playerId]?.fishingCast, clock.daySerial ?? clock.day) };
  }
  private async online(roomId: string) {
    return (await this.db.prepare(`SELECT m.player_id AS playerId, m.nickname, p.session_id AS sessionId FROM family_members m JOIN family_presence p ON p.room_id = m.room_id AND p.user_id = m.user_id WHERE m.room_id = ? AND p.last_seen > ?`).bind(roomId, this.now() - FAMILY_PRESENCE_TTL_MS).all<{playerId: string; nickname: string; sessionId?: string}>()).results;
  }
  private nextDay(stored: StoredWorld, roomId: string, inventories: Record<string, FamilyInventory>) {
    waterFarmForRain(stored.farm, weatherFor(roomId, stored.daySerial ?? stored.day));
    advanceFarmDay(stored.farm);
    const previousDaySerial = stored.daySerial ?? stored.day;
    stored.daySerial = previousDaySerial + 1;
    stored.day = calendarDate(stored.daySerial).day;
    stored.buildings = normalizeBuildings(stored.buildings, stored.daySerial);
    stored.ranchState = normalizeRanchState(stored.ranchState, stored.buildings);
    advanceRanchDay(stored.ranchState, previousDaySerial, stored.daySerial);
    stored.placeables = normalizePlaceables(stored.placeables, worldMinute(stored.daySerial, GAME_CONFIG.day.startMinutes));
    waterFarmForRain(stored.farm, weatherFor(roomId, stored.daySerial));
    stored.forestState = emptyForestState(stored.daySerial);
    stored.mineDaily = emptyMineDaily(stored.daySerial);
    stored.timeMinutes = GAME_CONFIG.day.startMinutes; stored.clockAnchor = this.now(); stored.sleepVotes = []; stored.sleepSessions = {};
    for (const personal of Object.values(inventories)) {
      const stats = normalizePlayerStats(personal.stats);
      restoreStamina(stats);
      personal.stats = stats;
      personal.fishingCast = null;
    }
  }
  async read(userId: string, roomId: string): Promise<FamilySnapshot> {
    const member = await this.requireMember(userId, roomId);
    let row = await this.row(roomId);
    const online = await this.online(roomId), stored = JSON.parse(row.world_json) as StoredWorld;
    const votes = (stored.sleepVotes ?? []).filter(id => online.some(p => p.playerId === id && (!stored.sleepSessions?.[id] || stored.sleepSessions[id] === p.sessionId)));
    if (votes.length !== (stored.sleepVotes ?? []).length || (online.length && votes.length === online.length)) {
      stored.sleepVotes = votes;
      const inventories = JSON.parse(row.inventories_json) as Record<string, FamilyInventory>;
      if (online.length && votes.length === online.length) this.nextDay(stored, roomId, inventories);
      await this.db.prepare("UPDATE family_state SET world_json = ?, inventories_json = ?, revision = revision + 1, updated_at = ? WHERE room_id = ? AND revision = ?")
        .bind(JSON.stringify(stored), JSON.stringify(inventories), this.now(), roomId, row.revision).run();
      row = await this.row(roomId);
    }
    const current = JSON.parse(row.world_json) as StoredWorld;
    const waiting = online.filter(p => current.sleepVotes?.includes(p.playerId));
    return { ...this.snapshot(row, member.playerId, roomId), sleep: { waiting: waiting.map(p => p.nickname), agreed: waiting.length, online: online.length, voted: waiting.some(p => p.playerId === member.playerId) } };
  }
  async act(userId: string, roomId: string, expectedRevision: unknown, raw: unknown) {
    const member = await this.requireMember(userId, roomId);
    if (!Number.isSafeInteger(expectedRevision) || (expectedRevision as number) < 0) throw new FamilyError(400, "revision이 올바르지 않습니다.");
    if (!raw || typeof raw !== "object") throw new FamilyError(400, "행동이 필요합니다.");
    const action = raw as FamilyAction, pose = parseFamilyPose(action.pose);
    if (!pose) throw new FamilyError(400, "플레이어 위치가 올바르지 않습니다.");
    const row = await this.row(roomId);
    const conflict = async () => new FamilyError(409, "다른 가족의 변경을 받았습니다. 상태를 확인한 뒤 다시 행동해 주세요.", { snapshot: await this.read(userId, roomId) });
    if (row.revision !== expectedRevision) throw await conflict();
    const stored = JSON.parse(row.world_json) as StoredWorld;
    waterFarmForRain(stored.farm, weatherFor(roomId, stored.daySerial ?? stored.day));
    const inventories = JSON.parse(row.inventories_json) as Record<string, FamilyInventory>;
    const inventory = new Inventory(inventories[member.playerId]);
    const toolProgression = normalizeToolProgression(inventories[member.playerId]?.toolProgression);
    const stats = normalizePlayerStats(inventories[member.playerId]?.stats);
    let fishingProgress = normalizeFishingProgress(inventories[member.playerId]?.fishingProgress);
    let fishingCast = normalizeFishingCast(inventories[member.playerId]?.fishingCast, stored.daySerial ?? stored.day);
    let fishingNotice: string | undefined;
    const cropId = action.kind === "tool" && action.tool === "seed" ? action.cropId ?? DEFAULT_CROP_ID : DEFAULT_CROP_ID;
    if (!isCropId(cropId)) throw new FamilyError(400, "없는 씨앗 종류입니다.");
    const crop = getCropDefinition(cropId);
    const near = (kind: "sleep" | "open_shop" | "craft") => {
      const feet = playerFeetPointFromPosition(pose), target = interactionTargetPointFromPosition(pose, pose.facing);
      return (MAP_DEFINITIONS[pose.mapId]?.objects ?? []).some((o) => o.interaction?.action === kind &&
        (pointInTileRect(feet.x, feet.y, o.interaction.area) || pointInTileRect(target.x, target.y, o.interaction.area)));
    };
    if (action.kind === "tool") {
      if (pose.mapId !== "farm" || !Number.isInteger(action.x) || !Number.isInteger(action.y) || !["hoe", "seed", "water", "hand"].includes(action.tool)) throw new FamilyError(400, "올바른 농사 행동이 아닙니다.");
      const tile = stored.farm.find((t) => t.x === action.x && t.y === action.y);
      if (!tile || Math.hypot(pose.x - (tile.x + .5) * GAME_CONFIG.tileSize, pose.y - (tile.y + .5) * GAME_CONFIG.tileSize) > GAME_CONFIG.farmInteractionDistance) throw new FamilyError(400, "밭 가까이에서 행동해 주세요.");
      if (action.tool === "hoe") {
        if (tile.tilled) throw new FamilyError(409, "이미 갈아 둔 밭이에요.");
        if (!canPerformAction(stats, "hoe")) throw new FamilyError(409, "체력이 부족합니다. 잠을 자고 회복하세요.");
        tile.tilled = true; if (weatherFor(roomId, stored.daySerial ?? stored.day).id === "rain") tile.wateredToday = true;
        recordSuccessfulAction(stats, "hoe");
      }
      else if (action.tool === "seed") {
        if (!tile.tilled || tile.cropType) throw new FamilyError(409, "비어 있는 갈아놓은 밭에 심어 주세요.");
        if (!inventory.consume(crop.seedItemId)) throw new FamilyError(409, "씨앗이 없습니다.");
        Object.assign(tile, { cropType: cropId, cropStage: 0, plantedDay: calendarDate(stored.daySerial ?? stored.day).day, wateredToday: weatherFor(roomId, stored.daySerial ?? stored.day).id === "rain" });
      } else if (action.tool === "water") {
        if (!tile.cropType) throw new FamilyError(409, "먼저 씨앗을 심어 주세요.");
        if (tile.wateredToday) throw new FamilyError(409, "오늘은 이미 물을 주었어요.");
        if (!canPerformAction(stats, "water")) throw new FamilyError(409, "체력이 부족합니다. 잠을 자고 회복하세요.");
        tile.wateredToday = true;
        recordSuccessfulAction(stats, "water");
      } else {
        if (!tile.cropType || tile.cropStage === null || !isMatureCrop(tile.cropType, tile.cropStage)) throw new FamilyError(409, "아직 수확할 수 없습니다.");
        inventory.add(getCropDefinition(tile.cropType).harvestItemId);
        Object.assign(tile, { cropType: null, cropStage: null, plantedDay: null, wateredToday: false });
        recordSuccessfulAction(stats, "harvest");
      }
    } else if (action.kind === "forest-gather") {
      const daySerial = stored.daySerial ?? stored.day;
      if (pose.mapId !== "fairy_forest" || !Number.isSafeInteger(action.daySerial) || action.daySerial !== daySerial) throw new FamilyError(400, "현재 날짜의 요정의 숲에서 채집해 주세요.");
      if (typeof action.nodeId !== "string" || !validForestNodeId(action.nodeId)) throw new FamilyError(400, "없는 숲 자원입니다.");
      const forest = generateResourceForest(roomId, daySerial);
      const node = forest.objects.find(o => o.id === action.nodeId), kind = node && resourceKind(node);
      if (!node || !kind) throw new FamilyError(400, "현재 숲에 없는 자원입니다.");
      if (Math.hypot(pose.x - node.position.tileX * GAME_CONFIG.tileSize, pose.y - node.position.tileY * GAME_CONFIG.tileSize) > 58) throw new FamilyError(400, "숲 자원 가까이에서 사용해 주세요.");
      if (action.tool !== FOREST_RESOURCES[kind].tool || pose.selectedTool !== action.tool) throw new FamilyError(400, "해당 자원에 맞는 도구를 선택해 주세요.");
      if (kind === "ore" && toolProgression.pickaxe < 1) throw new FamilyError(400, "먼저 곡괭이를 해금해 주세요.");
      const forestState = normalizeForestState(stored.forestState, daySerial, new Set(forest.objects.map(o => o.id)));
      if (forestState.depleted.includes(node.id)) throw await conflict();
      const skillAction = action.tool === "axe" ? "axe" : action.tool === "pickaxe" ? "pickaxe" : "forage";
      if (!canPerformAction(stats, skillAction)) throw new FamilyError(409, "체력이 부족합니다. 잠을 자고 회복하세요.");
      const result = strikeForestNode(forestState, node, action.tool, toolProgression);
      if (result.state === forestState) throw new FamilyError(409, result.message);
      stored.forestState = result.state;
      if (result.drop) inventory.add(result.drop, result.quantity);
      recordSuccessfulAction(stats, skillAction);
    } else if (action.kind === "mine-hit") {
      const daySerial = stored.daySerial ?? stored.day;
      const progress = normalizeMineProgress(stored.mineProgress);
      if (!Number.isSafeInteger(action.floor) || action.floor < 1 || action.floor > MINE_PLAYABLE_FLOORS || action.floor > progress.deepestUnlockedFloor ||
          pose.mapId !== mineMapId(action.floor) || action.daySerial !== daySerial) throw new FamilyError(400, "현재 접근 가능한 광산 층과 날짜를 확인해 주세요.");
      if (action.tool !== "pickaxe" || pose.selectedTool !== "pickaxe" || !toolProgression.pickaxe) throw new FamilyError(400, "곡괭이를 해금하고 선택해 주세요.");
      const presence = await this.db.prepare("SELECT pose_json, last_seen FROM family_presence WHERE room_id = ? AND user_id = ?")
        .bind(roomId, userId).first<{ pose_json: string; last_seen: number }>();
      let observed = null;
      try { observed = presence ? parseFamilyPose(JSON.parse(presence.pose_json)) : null; } catch { /* Invalid presence cannot authorize a hit. */ }
      const age = presence ? this.now() - presence.last_seen : Infinity;
      if (!observed || age < 0 || age > FAMILY_PRESENCE_TTL_MS || observed.mapId !== pose.mapId ||
          Math.hypot(observed.x - pose.x, observed.y - pose.y) > GAME_CONFIG.playerSpeed * Math.min(2.5, age / 1000 + .5))
        throw new FamilyError(400, "현재 광산 위치를 동기화한 뒤 가까이에서 채광해 주세요.");
      if (typeof action.nodeId !== "string" || action.nodeId.length > 48) throw new FamilyError(400, "올바른 광산 자원이 아닙니다.");
      const floorMap = generateMineFloor(roomId, daySerial, action.floor);
      const node = floorMap.objects.find(o => o.id === action.nodeId && mineResourceKind(o));
      if (!node) throw new FamilyError(400, "현재 층에 없는 자원입니다.");
      if (Math.hypot(pose.x - node.position.tileX * GAME_CONFIG.tileSize, pose.y - node.position.tileY * GAME_CONFIG.tileSize) > 58) throw new FamilyError(400, "광석 가까이에서 곡괭이를 사용해 주세요.");
      const daily = normalizeMineDaily(stored.mineDaily, daySerial, roomId);
      if (daily.floors[action.floor]?.depleted.includes(node.id)) throw await conflict();
      if (!canPerformAction(stats, "pickaxe")) throw new FamilyError(409, "체력이 부족합니다. 잠을 자고 회복하세요.");
      const result = strikeMineNode(daily, progress, action.floor, node, toolProgression);
      if (!result) throw await conflict();
      stored.mineDaily = result.daily; stored.mineProgress = result.progress;
      if (result.drop) inventory.add(result.drop, result.quantity);
      recordSuccessfulAction(stats, "pickaxe");
    } else if (action.kind === "fish-cast" || action.kind === "fish-reel") {
      // Cross-check the reported shore location against the recently observed player pose.
      const presence = await this.db.prepare("SELECT pose_json, last_seen FROM family_presence WHERE room_id = ? AND user_id = ?")
        .bind(roomId, userId).first<{ pose_json: string; last_seen: number }>();
      let observed = null;
      try { observed = presence ? parseFamilyPose(JSON.parse(presence.pose_json)) : null; } catch { /* Invalid presence cannot authorize fishing. */ }
      const age = presence ? this.now() - presence.last_seen : Infinity;
      if (!observed || age < 0 || age > FAMILY_PRESENCE_TTL_MS || observed.mapId !== pose.mapId ||
          Math.hypot(observed.x - pose.x, observed.y - pose.y) > GAME_CONFIG.playerSpeed * Math.min(2.5, age / 1000 + .5))
        throw new FamilyError(400, "물가의 현재 위치를 동기화한 뒤 낚시해 주세요.");
      const day = stored.daySerial ?? stored.day, time = currentWorld(stored, this.now(), roomId).timeMinutes;
      if (action.kind === "fish-cast") {
        const result = beginFishing(fishingProgress, fishingCast, pose, action.spotId, roomId, member.playerId, day, weatherFor(roomId, day).id, time, stats);
        if (result.error || !result.cast || !result.progress) throw new FamilyError(409, result.error ?? "낚시를 시작할 수 없어요.");
        fishingProgress = result.progress; fishingCast = result.cast;
        fishingNotice = "찌를 던졌어요. 입질이 오면 행동 버튼을 누르세요.";
      } else {
        const error = fishingSpotError(fishingCast?.spotId, pose);
        if (error) throw new FamilyError(400, error);
        const result = reelFishing(fishingCast, action.castId, fishingProgress, inventory, stats, day, time);
        if (result.error) throw new FamilyError(409, result.error);
        fishingCast = result.cast ?? null; fishingNotice = result.message;
      }
    } else if (action.kind === "sleep") {
      if (!near("sleep")) throw new FamilyError(400, "농장집 침대에서 잠들어 주세요.");
      const online = await this.online(roomId);
      if (!online.some(p => p.playerId === member.playerId)) online.push(member);
      stored.sleepVotes = [...new Set([...(stored.sleepVotes ?? []).filter(id => online.some(p => p.playerId === id && (!stored.sleepSessions?.[id] || stored.sleepSessions[id] === p.sessionId))), member.playerId])];
      stored.sleepSessions = { ...stored.sleepSessions, [member.playerId]: online.find(p => p.playerId === member.playerId)?.sessionId ?? "" };
      if (online.every(p => stored.sleepVotes!.includes(p.playerId))) { this.nextDay(stored, roomId, inventories); restoreStamina(stats); fishingCast = null; }
    } else if (action.kind === "sleep-cancel") {
      stored.sleepVotes = (stored.sleepVotes ?? []).filter(id => id !== member.playerId);
    } else if (action.kind === "buy") {
      if (!near("open_shop")) throw new FamilyError(400, "상점 카운터에서 구매해 주세요.");
      const listing = GENERAL_STORE_LISTINGS.find((l) => l.id === action.listingId);
      if (!listing) throw new FamilyError(400, "없는 상품입니다.");
      const result = purchaseInventoryItem(inventory, stored.money, listing.itemId, listing.price, listing.quantity);
      if (!result.purchased) throw new FamilyError(409, "공동 자금이 부족합니다.");
      stored.money = result.money;
    } else if (action.kind === "craft" || action.kind === "tool-upgrade") {
      const table = (MAP_DEFINITIONS[pose.mapId]?.objects ?? []).find(o => o.interaction?.action === "craft");
      if (!table || !near("craft") || Math.hypot(pose.x - table.position.tileX * GAME_CONFIG.tileSize, pose.y - table.position.tileY * GAME_CONFIG.tileSize) > 90)
        throw new FamilyError(400, "제작대 가까이에서 제작해 주세요.");
      if (action.kind === "craft") {
        const recipe = getRecipe(action.recipeId);
        if (!recipe) throw new FamilyError(400, "없는 제작법이에요.");
        if (!craft(inventory, recipe)) throw new FamilyError(409, "제작 재료가 부족해요.");
      } else {
        const upgrade = getToolUpgrade(action.upgradeId);
        if (!upgrade) throw new FamilyError(400, "없는 도구 강화예요.");
        if (!upgradeTool(inventory, toolProgression, upgrade)) throw new FamilyError(409, "도구 단계나 재료를 확인해 주세요.");
      }
    } else if (action.kind === "sell") {
      stored.money += sellMarketGoods(inventory).earned;
    } else if (action.kind === "storage") {
      const chest = (MAP_DEFINITIONS[pose.mapId]?.objects ?? []).find(o => o.interaction?.action === "storage" && o.interaction.containerId === action.containerId);
      const feet = playerFeetPointFromPosition(pose), target = interactionTargetPointFromPosition(pose, pose.facing);
      if (!chest || !chest.interaction ||
          !(pointInTileRect(feet.x, feet.y, chest.interaction.area) || pointInTileRect(target.x, target.y, chest.interaction.area)) ||
          Math.hypot(pose.x - chest.position.tileX * GAME_CONFIG.tileSize, pose.y - chest.position.tileY * GAME_CONFIG.tileSize) > 90)
        throw new FamilyError(400, "보관함 가까이에서 이용해 주세요.");
      const storage = normalizeStorage(stored.storage);
      const error = transferItem(inventory, storage, action.containerId, action.direction, action.itemId, action.quantity);
      if (error) throw new FamilyError(409, error);
      stored.storage = storage;
    } else if (action.kind === "animal-buy" || action.kind === "animal-feed" || action.kind === "animal-pet" || action.kind === "animal-collect") {
      const buildings = normalizeBuildings(stored.buildings, stored.daySerial ?? stored.day);
      const ranch = normalizeRanchState(stored.ranchState, buildings);
      const animal = "animalId" in action ? ranch.animals.find(a => a.id === action.animalId) : undefined;
      const homeId = "homeBuildingId" in action ? action.homeBuildingId : animal?.homeBuildingId;
      const home = buildings.instances.find(b => b.id === homeId && b.definitionId === "chicken_coop" && b.status === "ready");
      if (!home || pose.mapId !== home.mapId) throw new FamilyError(400, "완성된 닭장 가까이에서 돌봐 주세요.");
      const definition = BUILDING_DEFINITIONS[home.definitionId];
      const centerX = (home.tileX + definition.footprint.width / 2) * GAME_CONFIG.tileSize;
      const centerY = (home.tileY + definition.footprint.height / 2) * GAME_CONFIG.tileSize;
      if (Math.hypot(pose.x - centerX, pose.y - centerY) > 150) throw new FamilyError(400, "닭장 가까이에서 돌봐 주세요.");
      if (action.kind === "animal-buy") {
        const result = buyAnimal(ranch, buildings, stored.money, action.species, home.id, crypto.randomUUID(), stored.daySerial ?? stored.day);
        if (result.error) throw new FamilyError(409, result.error);
        stored.money = result.money;
      } else if (action.kind === "animal-feed") {
        const error = feedCoop(ranch, buildings, inventory, home.id, stored.daySerial ?? stored.day);
        if (error) throw new FamilyError(409, error);
      } else if (action.kind === "animal-pet") {
        const error = petAnimal(ranch, action.animalId, stored.daySerial ?? stored.day);
        if (error) throw new FamilyError(409, error);
      } else {
        const error = collectAnimalProduce(ranch, inventory, action.animalId);
        if (error) throw new FamilyError(409, error);
      }
      stored.ranchState = ranch;
    } else if (action.kind === "farm-expand") {
      const expansion = typeof action.expansionId === "string" ? FARM_EXPANSIONS[action.expansionId as keyof typeof FARM_EXPANSIONS] : undefined;
      if (!expansion || pose.mapId !== "farm" || Math.hypot(pose.x - (expansion.area.startX + expansion.area.endX + 1) * GAME_CONFIG.tileSize / 2,
        pose.y - (expansion.area.startY + expansion.area.endY + 1) * GAME_CONFIG.tileSize / 2) > 150) throw new FamilyError(400, "확장할 밭 가까이에서 이용해 주세요.");
      const progress = normalizeFarmProgress(stored.farmProgress);
      const result = unlockExpansion(progress, stored.farm, inventory, stored.money, action.expansionId,
        normalizePlaceables(stored.placeables), normalizeBuildings(stored.buildings, stored.daySerial ?? stored.day));
      if (result.error) throw new FamilyError(409, result.error);
      stored.money = result.money; stored.farmProgress = progress;
      if (weatherFor(roomId, stored.daySerial ?? stored.day).id === "rain") waterFarmForRain(stored.farm, weatherFor(roomId, stored.daySerial ?? stored.day));
    } else if (action.kind === "build") {
      const definition = typeof action.definitionId === "string" ? BUILDING_DEFINITIONS[action.definitionId as keyof typeof BUILDING_DEFINITIONS] : undefined;
      if (!definition || pose.mapId !== "farm" || !Number.isSafeInteger(action.tileX) || !Number.isSafeInteger(action.tileY) ||
        Math.hypot(pose.x - (action.tileX + definition.footprint.width / 2) * GAME_CONFIG.tileSize,
          pose.y - (action.tileY + definition.footprint.height / 2) * GAME_CONFIG.tileSize) > 140)
        throw new FamilyError(400, "건설할 위치 가까이에서 이용해 주세요.");
      const nearby = await this.db.prepare("SELECT pose_json FROM family_presence WHERE room_id=? AND last_seen>?").bind(roomId, this.now() - FAMILY_PRESENCE_TTL_MS).all<{ pose_json: string }>();
      const players = [pose, ...nearby.results.flatMap(row => { try { const p = parseFamilyPose(JSON.parse(row.pose_json)); return p ? [p] : []; } catch { return []; } })];
      const buildings = normalizeBuildings(stored.buildings, stored.daySerial ?? stored.day);
      const result = constructBuilding(buildings, normalizePlaceables(stored.placeables), stored.farm, inventory, stored.money,
        MAP_DEFINITIONS.farm, action.definitionId, action.tileX, action.tileY, players, crypto.randomUUID(), stored.daySerial ?? stored.day);
      if (result.error) throw new FamilyError(409, result.error);
      stored.money = result.money; stored.buildings = buildings;
    } else if (action.kind === "place" || action.kind === "place-remove" || action.kind === "machine-start" || action.kind === "machine-collect") {
      const time = currentWorld(stored, this.now(), roomId).timeMinutes;
      const now = worldMinute(stored.daySerial ?? stored.day, time);
      const placeables = normalizePlaceables(stored.placeables, now);
      if (action.kind === "place") {
        if (pose.mapId !== "farm" || !Number.isSafeInteger(action.tileX) || !Number.isSafeInteger(action.tileY) ||
            Math.hypot(pose.x - (action.tileX + .5) * GAME_CONFIG.tileSize, pose.y - (action.tileY + .5) * GAME_CONFIG.tileSize) > 90)
          throw new FamilyError(400, "농장 가까운 칸에 배치해 주세요.");
        const nearby = await this.db.prepare("SELECT pose_json FROM family_presence WHERE room_id=? AND last_seen>?").bind(roomId, this.now() - FAMILY_PRESENCE_TTL_MS).all<{ pose_json: string }>();
        const players = [pose, ...nearby.results.flatMap(row => { try { const p = parseFamilyPose(JSON.parse(row.pose_json)); return p ? [p] : []; } catch { return []; } })];
        const error = placeObject(placeables, inventory, action.definitionId, MAP_DEFINITIONS.farm, action.tileX, action.tileY, players, crypto.randomUUID(), normalizeBuildings(stored.buildings, stored.daySerial ?? stored.day));
        if (error) throw new FamilyError(409, error);
      } else {
        const instance = placeables.instances.find(p => p.id === action.instanceId && p.mapId === pose.mapId);
        if (!instance || Math.hypot(pose.x - (instance.tileX + .5) * GAME_CONFIG.tileSize, pose.y - (instance.tileY + .5) * GAME_CONFIG.tileSize) > 70)
          throw new FamilyError(400, "기계 가까이에서 이용해 주세요.");
        const error = action.kind === "place-remove" ? removeObject(placeables, inventory, action.instanceId, pose) :
          action.kind === "machine-start" ? startMachine(instance.state.machine, inventory, action.processId, now) :
          collectMachine(instance.state.machine, inventory, now);
        if (error) throw new FamilyError(409, error);
      }
      stored.placeables = placeables;
    } else throw new FamilyError(400, "지원하지 않는 행동입니다.");
    inventories[member.playerId] = { ...inventory.serialize(), toolProgression, stats, fishingProgress, fishingCast };
    const result = await this.db.prepare(`UPDATE family_state SET world_json = ?, inventories_json = ?, revision = revision + 1, updated_at = ? WHERE room_id = ? AND revision = ?`)
      .bind(JSON.stringify(stored), JSON.stringify(inventories), this.now(), roomId, expectedRevision).run();
    if (result.meta.changes !== 1) throw await conflict();
    if (action.kind === "tool" || action.kind === "forest-gather" || action.kind === "mine-hit") {
      const visual = { id: crypto.randomUUID(), tool: action.tool, facing: pose.facing, expiresAt: this.now() + 2500 };
      // Visual delivery must never turn a committed farm action into a failed command.
      try { await this.db.prepare("UPDATE family_presence SET pose_json = json_set(pose_json, '$.action', json(?)) WHERE room_id = ? AND user_id = ?")
        .bind(JSON.stringify(visual), roomId, userId).run(); } catch { /* Presence is best effort. */ }
    }
    return { ...await this.read(userId, roomId), ...(fishingNotice ? { fishingNotice } : {}) };
  }
}
