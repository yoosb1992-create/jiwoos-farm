import type { FarmTileData } from "../domain";
import { canPerformAction, recordSuccessfulAction, type PlayerStats } from "../player/stats";
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
