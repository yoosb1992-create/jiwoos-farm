import { FAMILY_PRESENCE_TTL_MS } from "../../game/family/presence";
import { GAME_CONFIG } from "../../game/config";
import { advanceFarmDay, sellAllCrops, Inventory, purchaseInventoryItem, type InventoryData } from "../../game/domain";
import { DEFAULT_CROP_ID, isCropId, getCropDefinition, isMatureCrop } from "../../game/data/crops";
import { GENERAL_STORE_LISTINGS } from "../../game/data/shop";
import { MAP_DEFINITIONS, pointInTileRect } from "../../game/maps/definitions";
import { PLAYER_ASSET } from "../../game/assets/definitions";
import { parseFamilyPose } from "../../game/family/personal";
import type { FamilyAction, FamilySnapshot, FamilyWorld } from "../../game/family/types";
import { getRecipe } from "../../game/crafting/definitions";
import { craft } from "../../game/crafting/engine";
import { normalizeToolProgression } from "../../game/tools/progression";
import { upgradeTool } from "../../game/tools/progression";
import { getToolUpgrade } from "../../game/tools/definitions";
import type { ToolProgression } from "../../game/tools/types";
import { FamilyError, FamilyRooms } from "./rooms";
import { emptyForestState, FOREST_RESOURCES, generateResourceForest, normalizeForestState, resourceKind, strikeForestNode, validForestNodeId } from "../../game/forest/resources";

interface StoredWorld extends FamilyWorld { clockAnchor: number; sleepVotes?: string[]; sleepSessions?: Record<string, string> }
interface StateRow { revision: number; world_json: string; inventories_json: string }
type FamilyInventory = InventoryData & { toolProgression?: ToolProgression };
export const initialFamilyWorld = (now: number): StoredWorld => ({
  day: 1, daySerial: 1, timeMinutes: GAME_CONFIG.day.startMinutes, clockAnchor: now, money: GAME_CONFIG.startingMoney,
  forestState: emptyForestState(1),
  farm: MAP_DEFINITIONS.farm.farmAreas.flatMap((area) => Array.from({ length: area.endY - area.startY + 1 }, (_, j) =>
    Array.from({ length: area.endX - area.startX + 1 }, (_, i) => ({ x: area.startX + i, y: area.startY + j, tilled: false, wateredToday: false, cropType: null, cropStage: null, plantedDay: null }))).flat()),
});
function currentWorld(stored: StoredWorld, now: number): FamilyWorld {
  return { day: stored.day, daySerial: stored.daySerial ?? stored.day, forestState: normalizeForestState(stored.forestState, stored.daySerial ?? stored.day), money: stored.money, farm: stored.farm,
    timeMinutes: Math.min(GAME_CONFIG.day.endMinutes, stored.timeMinutes + Math.floor(Math.max(0, now - stored.clockAnchor) / GAME_CONFIG.day.realMsPerGameMinute)) };
}
export class FamilyState extends FamilyRooms {
  private async row(roomId: string): Promise<StateRow> {
    await this.db.prepare("INSERT OR IGNORE INTO family_state (room_id, revision, world_json, inventories_json, updated_at) VALUES (?, 0, ?, '{}', ?)")
      .bind(roomId, JSON.stringify(initialFamilyWorld(this.now())), this.now()).run();
    const row = await this.db.prepare("SELECT revision, world_json, inventories_json FROM family_state WHERE room_id = ?").bind(roomId).first<StateRow>();
    if (!row) throw new FamilyError(503, "공유 상태를 읽을 수 없습니다.");
    return row;
  }
  private snapshot(row: StateRow, playerId: string): FamilySnapshot {
    const inventories = JSON.parse(row.inventories_json) as Record<string, FamilyInventory>;
    const clock = JSON.parse(row.world_json) as StoredWorld;
    return { npcTimeMinutes: Math.min(GAME_CONFIG.day.endMinutes, clock.timeMinutes + Math.max(0, this.now()-clock.clockAnchor)/GAME_CONFIG.day.realMsPerGameMinute), revision: row.revision, serverNow: this.now(), world: currentWorld(JSON.parse(row.world_json), this.now()), inventory: inventories[playerId] ?? new Inventory().serialize(), toolProgression: normalizeToolProgression(inventories[playerId]?.toolProgression) };
  }
  private async online(roomId: string) {
    return (await this.db.prepare(`SELECT m.player_id AS playerId, m.nickname, p.session_id AS sessionId FROM family_members m JOIN family_presence p ON p.room_id = m.room_id AND p.user_id = m.user_id WHERE m.room_id = ? AND p.last_seen > ?`).bind(roomId, this.now() - FAMILY_PRESENCE_TTL_MS).all<{playerId: string; nickname: string; sessionId?: string}>()).results;
  }
  private nextDay(stored: StoredWorld) {
    stored.daySerial = (stored.daySerial ?? stored.day) + 1;
    stored.forestState = emptyForestState(stored.daySerial);
    advanceFarmDay(stored.farm); stored.day = stored.day >= GAME_CONFIG.day.daysPerSeason ? 1 : stored.day + 1;
    stored.timeMinutes = GAME_CONFIG.day.startMinutes; stored.clockAnchor = this.now(); stored.sleepVotes = []; stored.sleepSessions = {};
  }
  async read(userId: string, roomId: string): Promise<FamilySnapshot> {
    const member = await this.requireMember(userId, roomId);
    let row = await this.row(roomId);
    const online = await this.online(roomId), stored = JSON.parse(row.world_json) as StoredWorld;
    const votes = (stored.sleepVotes ?? []).filter(id => online.some(p => p.playerId === id && (!stored.sleepSessions?.[id] || stored.sleepSessions[id] === p.sessionId)));
    if (votes.length !== (stored.sleepVotes ?? []).length || (online.length && votes.length === online.length)) {
      stored.sleepVotes = votes;
      if (online.length && votes.length === online.length) this.nextDay(stored);
      await this.db.prepare("UPDATE family_state SET world_json = ?, revision = revision + 1, updated_at = ? WHERE room_id = ? AND revision = ?")
        .bind(JSON.stringify(stored), this.now(), roomId, row.revision).run();
      row = await this.row(roomId);
    }
    const current = JSON.parse(row.world_json) as StoredWorld;
    const waiting = online.filter(p => current.sleepVotes?.includes(p.playerId));
    return { ...this.snapshot(row, member.playerId), sleep: { waiting: waiting.map(p => p.nickname), agreed: waiting.length, online: online.length, voted: waiting.some(p => p.playerId === member.playerId) } };
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
    const inventories = JSON.parse(row.inventories_json) as Record<string, FamilyInventory>;
    const inventory = new Inventory(inventories[member.playerId]);
    const toolProgression = normalizeToolProgression(inventories[member.playerId]?.toolProgression);
    const cropId = action.kind === "tool" && action.tool === "seed" ? action.cropId ?? DEFAULT_CROP_ID : DEFAULT_CROP_ID;
    if (!isCropId(cropId)) throw new FamilyError(400, "없는 씨앗 종류입니다.");
    const crop = getCropDefinition(cropId);
    const near = (kind: "sleep" | "open_shop" | "craft") => {
      const offset = PLAYER_ASSET.interactionPoints[pose.facing];
      return (MAP_DEFINITIONS[pose.mapId]?.objects ?? []).some((o) => o.interaction?.action === kind &&
        (pointInTileRect(pose.x, pose.y, o.interaction.area) || pointInTileRect(pose.x + offset.x, pose.y + offset.y, o.interaction.area)));
    };
    if (action.kind === "tool") {
      if (pose.mapId !== "farm" || !Number.isInteger(action.x) || !Number.isInteger(action.y) || !["hoe", "seed", "water", "hand"].includes(action.tool)) throw new FamilyError(400, "올바른 농사 행동이 아닙니다.");
      const tile = stored.farm.find((t) => t.x === action.x && t.y === action.y);
      if (!tile || Math.hypot(pose.x - (tile.x + .5) * GAME_CONFIG.tileSize, pose.y - (tile.y + .5) * GAME_CONFIG.tileSize) > GAME_CONFIG.farmInteractionDistance) throw new FamilyError(400, "밭 가까이에서 행동해 주세요.");
      if (action.tool === "hoe") tile.tilled = true;
      else if (action.tool === "seed") {
        if (!tile.tilled || tile.cropType) throw new FamilyError(409, "비어 있는 갈아놓은 밭에 심어 주세요.");
        if (!inventory.consume(crop.seedItemId)) throw new FamilyError(409, "씨앗이 없습니다.");
        Object.assign(tile, { cropType: cropId, cropStage: 0, plantedDay: stored.day, wateredToday: false });
      } else if (action.tool === "water") {
        if (!tile.cropType) throw new FamilyError(409, "먼저 씨앗을 심어 주세요.");
        tile.wateredToday = true;
      } else {
        if (!tile.cropType || tile.cropStage === null || !isMatureCrop(tile.cropType, tile.cropStage)) throw new FamilyError(409, "아직 수확할 수 없습니다.");
        inventory.add(getCropDefinition(tile.cropType).harvestItemId);
        Object.assign(tile, { cropType: null, cropStage: null, plantedDay: null, wateredToday: false });
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
      const forestState = normalizeForestState(stored.forestState, daySerial, new Set(forest.objects.map(o => o.id)));
      if (forestState.depleted.includes(node.id)) throw await conflict();
      const result = strikeForestNode(forestState, node, action.tool);
      stored.forestState = result.state;
      if (result.drop) inventory.add(result.drop, result.quantity);
    } else if (action.kind === "sleep") {
      if (!near("sleep")) throw new FamilyError(400, "농장집 침대에서 잠들어 주세요.");
      const online = await this.online(roomId);
      if (!online.some(p => p.playerId === member.playerId)) online.push(member);
      stored.sleepVotes = [...new Set([...(stored.sleepVotes ?? []).filter(id => online.some(p => p.playerId === id && (!stored.sleepSessions?.[id] || stored.sleepSessions[id] === p.sessionId))), member.playerId])];
      stored.sleepSessions = { ...stored.sleepSessions, [member.playerId]: online.find(p => p.playerId === member.playerId)?.sessionId ?? "" };
      if (online.every(p => stored.sleepVotes!.includes(p.playerId))) this.nextDay(stored);
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
      stored.money += sellAllCrops(inventory).earned;
    } else throw new FamilyError(400, "지원하지 않는 행동입니다.");
    inventories[member.playerId] = { ...inventory.serialize(), toolProgression };
    const result = await this.db.prepare(`UPDATE family_state SET world_json = ?, inventories_json = ?, revision = revision + 1, updated_at = ? WHERE room_id = ? AND revision = ?`)
      .bind(JSON.stringify(stored), JSON.stringify(inventories), this.now(), roomId, expectedRevision).run();
    if (result.meta.changes !== 1) throw await conflict();
    if (action.kind === "tool" || action.kind === "forest-gather") {
      const visual = { id: crypto.randomUUID(), tool: action.tool, facing: pose.facing, expiresAt: this.now() + 2500 };
      // Visual delivery must never turn a committed farm action into a failed command.
      try { await this.db.prepare("UPDATE family_presence SET pose_json = json_set(pose_json, '$.action', json(?)) WHERE room_id = ? AND user_id = ?")
        .bind(JSON.stringify(visual), roomId, userId).run(); } catch { /* Presence is best effort. */ }
    }
    return this.read(userId, roomId);
  }
}
