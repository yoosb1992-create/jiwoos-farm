import { getCropDefinition, isMatureCrop, type CropId } from "../data/crops";
import type { ToolKey } from "../events";
import { Inventory, type FarmTileData } from "../domain";
import { canPerformAction, recordSuccessfulAction, type PlayerStats } from "../player/stats";
import { waterCrop, type WateringCanState } from "../tools/wateringCan";
import type { ToolProgression } from "../tools/types";

export const hasPlantedCrop = (tile: FarmTileData | undefined): tile is FarmTileData & { cropType: NonNullable<FarmTileData["cropType"]>; cropStage: number } =>
  Boolean(tile?.cropType && tile.cropStage !== null);

/** Restores an empty tilled farm tile to its original state. All validation is
 * shared by local and Family authority so crops can never be removed by this. */
export function undoTilledFarmTile(tile: FarmTileData, stats: PlayerStats, progression: ToolProgression): string | null {
  if (progression.pickaxe < 1) return "제작대에서 곡괭이를 해금해 주세요.";
  if (!tile.tilled) return "갈아 놓은 빈 밭에서 곡괭이를 사용해 주세요.";
  if (tile.cropType || tile.cropStage !== null) return "작물이 심겨 있어 땅을 되돌릴 수 없어요.";
  if (!canPerformAction(stats, "pickaxe")) return "체력이 부족합니다. 잠을 자고 회복하세요.";
  Object.assign(tile, {
    tilled: false,
    wateredToday: false,
    cropType: null,
    cropStage: null,
    plantedDay: null,
  });
  recordSuccessfulAction(stats, "pickaxe");
  return null;
}

export type FarmToolEffectContext = {
  selectedCrop: CropId;
  inventory: Inventory;
  stats: PlayerStats;
  wateringCan: WateringCanState;
  toolProgression: ToolProgression;
  day: number;
  raining: boolean;
};

export type FarmToolEffectResult = { changed: boolean; message: string };

/** Authoritative single-player farm mutation shared by FarmScene and its
 * integration regression. Visual animation is deliberately outside this
 * function so it can never gate or replace gameplay state changes. */
export function applyFarmToolEffect(tool: ToolKey, tile: FarmTileData, context: FarmToolEffectContext): FarmToolEffectResult {
  const crop = getCropDefinition(context.selectedCrop);
  if (tool === "hoe") {
    if (tile.tilled) return { changed: false, message: "이미 잘 갈아 둔 밭이에요." };
    if (!canPerformAction(context.stats, "hoe")) return { changed: false, message: "체력이 부족합니다. 잠을 자고 회복하세요." };
    tile.tilled = true;
    tile.wateredToday = context.raining;
    recordSuccessfulAction(context.stats, "hoe");
    return { changed: true, message: "포슬포슬하게 땅을 갈았어요." };
  }
  if (tool === "seed") {
    if (!tile.tilled) return { changed: false, message: "먼저 괭이로 땅을 갈아야 해요." };
    if (tile.cropStage !== null) return { changed: false, message: "이미 작물이 자라고 있어요." };
    if (!context.inventory.consume(crop.seedItemId)) return { changed: false, message: "씨앗이 없어요. 마을 상점에서 살 수 있어요." };
    Object.assign(tile, {
      cropType: context.selectedCrop,
      cropStage: 0,
      wateredToday: context.raining,
      plantedDay: context.day,
    });
    return { changed: true, message: `${crop.name} 씨앗을 심었어요.` };
  }
  if (tool === "water") {
    const error = waterCrop(tile, context.stats, context.wateringCan);
    return error
      ? { changed: false, message: error }
      : { changed: true, message: `물을 주었어요. 물 ${context.wateringCan.currentWater} / ${context.wateringCan.capacity}` };
  }
  if (tool === "pickaxe") {
    const error = undoTilledFarmTile(tile, context.stats, context.toolProgression);
    return error
      ? { changed: false, message: error }
      : { changed: true, message: "갈아 놓은 땅을 원래 상태로 되돌렸어요." };
  }
  if (tool !== "hand" || !tile.cropType || tile.cropStage === null || !isMatureCrop(tile.cropType, tile.cropStage)) {
    return { changed: false, message: "아직 수확할 때가 아니에요." };
  }
  const harvested = getCropDefinition(tile.cropType);
  context.inventory.add(harvested.harvestItemId);
  Object.assign(tile, { cropType: null, cropStage: null, wateredToday: false, plantedDay: null, tilled: true });
  recordSuccessfulAction(context.stats, "harvest");
  return { changed: true, message: `통통한 ${harvested.name}를 수확했어요!` };
}
