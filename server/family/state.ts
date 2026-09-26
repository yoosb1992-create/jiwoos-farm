import { GAME_CONFIG } from "../../game/config";
import { advanceFarmDay, Inventory, purchaseInventoryItem, type InventoryData } from "../../game/domain";
import { DEFAULT_CROP_ID, getCropDefinition, isMatureCrop } from "../../game/data/crops";
import { GENERAL_STORE_LISTINGS } from "../../game/data/shop";
import { MAP_DEFINITIONS, pointInTileRect } from "../../game/maps/definitions";
import { PLAYER_ASSET } from "../../game/assets/definitions";
import { parseFamilyPose } from "../../game/family/personal";
import type { FamilyAction, FamilySnapshot, FamilyWorld } from "../../game/family/types";
import { FamilyError, FamilyRooms } from "./rooms";

interface StoredWorld extends FamilyWorld { clockAnchor: number }
interface StateRow { revision: number; world_json: string; inventories_json: string }
export const initialFamilyWorld = (now: number): StoredWorld => ({
  day: 1, timeMinutes: GAME_CONFIG.day.startMinutes, clockAnchor: now, money: GAME_CONFIG.startingMoney,
  farm: MAP_DEFINITIONS.farm.farmAreas.flatMap((area) => Array.from({ length: area.endY - area.startY + 1 }, (_, j) =>
    Array.from({ length: area.endX - area.startX + 1 }, (_, i) => ({ x: area.startX + i, y: area.startY + j, tilled: false, wateredToday: false, cropType: null, cropStage: null, plantedDay: null }))).flat()),
});
function currentWorld(stored: StoredWorld, now: number): FamilyWorld {
  return { day: stored.day, money: stored.money, farm: stored.farm,
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
    const inventories = JSON.parse(row.inventories_json) as Record<string, InventoryData>;
    return { revision: row.revision, serverNow: this.now(), world: currentWorld(JSON.parse(row.world_json), this.now()), inventory: inventories[playerId] ?? new Inventory().serialize() };
  }
  async read(userId: string, roomId: string) {
    const member = await this.requireMember(userId, roomId);
    return this.snapshot(await this.row(roomId), member.playerId);
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
    const inventories = JSON.parse(row.inventories_json) as Record<string, InventoryData>;
    const inventory = new Inventory(inventories[member.playerId]);
    const crop = getCropDefinition(DEFAULT_CROP_ID);
    const near = (kind: "sleep" | "open_shop") => {
      const offset = PLAYER_ASSET.interactionPoints[pose.facing];
      return MAP_DEFINITIONS[pose.mapId].objects.some((o) => o.interaction?.action === kind &&
        (pointInTileRect(pose.x, pose.y, o.interaction.area) || pointInTileRect(pose.x + offset.x, pose.y + offset.y, o.interaction.area)));
    };
    if (action.kind === "tool") {
      if (pose.mapId !== "farm" || !Number.isInteger(action.x) || !Number.isInteger(action.y) || !["hoe", "seed", "water", "hand"].includes(action.tool)) throw new FamilyError(400, "올바른 농사 행동이 아닙니다.");
      const tile = stored.farm.find((t) => t.x === action.x && t.y === action.y);
      if (!tile || Math.hypot(pose.x - (tile.x + .5) * 32, pose.y - (tile.y + .5) * 32) > GAME_CONFIG.farmInteractionDistance) throw new FamilyError(400, "밭 가까이에서 행동해 주세요.");
      if (action.tool === "hoe") tile.tilled = true;
      else if (action.tool === "seed") {
        if (!tile.tilled || tile.cropType) throw new FamilyError(409, "비어 있는 갈아놓은 밭에 심어 주세요.");
        if (!inventory.consume(crop.seedItemId)) throw new FamilyError(409, "씨앗이 없습니다.");
        Object.assign(tile, { cropType: DEFAULT_CROP_ID, cropStage: 0, plantedDay: stored.day, wateredToday: false });
      } else if (action.tool === "water") {
        if (!tile.cropType) throw new FamilyError(409, "먼저 씨앗을 심어 주세요.");
        tile.wateredToday = true;
      } else {
        if (!tile.cropType || tile.cropStage === null || !isMatureCrop(tile.cropType, tile.cropStage)) throw new FamilyError(409, "아직 수확할 수 없습니다.");
        inventory.add(getCropDefinition(tile.cropType).harvestItemId);
        Object.assign(tile, { cropType: null, cropStage: null, plantedDay: null, wateredToday: false });
      }
    } else if (action.kind === "sleep") {
      if (!near("sleep")) throw new FamilyError(400, "농장집 침대에서 잠들어 주세요.");
      advanceFarmDay(stored.farm); stored.day = stored.day >= GAME_CONFIG.day.daysPerSeason ? 1 : stored.day + 1;
      stored.timeMinutes = GAME_CONFIG.day.startMinutes; stored.clockAnchor = this.now();
    } else if (action.kind === "buy") {
      if (!near("open_shop")) throw new FamilyError(400, "상점 카운터에서 구매해 주세요.");
      const listing = GENERAL_STORE_LISTINGS.find((l) => l.id === action.listingId);
      if (!listing) throw new FamilyError(400, "없는 상품입니다.");
      const result = purchaseInventoryItem(inventory, stored.money, listing.itemId, listing.price, listing.quantity);
      if (!result.purchased) throw new FamilyError(409, "공동 자금이 부족합니다.");
      stored.money = result.money;
    } else if (action.kind === "sell") {
      stored.money += inventory.sellAll(crop.harvestItemId, crop.sellPrice).earned;
    } else throw new FamilyError(400, "지원하지 않는 행동입니다.");
    inventories[member.playerId] = inventory.serialize();
    const result = await this.db.prepare(`UPDATE family_state SET world_json = ?, inventories_json = ?, revision = revision + 1, updated_at = ? WHERE room_id = ? AND revision = ?`)
      .bind(JSON.stringify(stored), JSON.stringify(inventories), this.now(), roomId, expectedRevision).run();
    if (result.meta.changes !== 1) throw await conflict();
    return this.read(userId, roomId);
  }
}
