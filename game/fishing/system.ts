import { GAME_CONFIG } from "../config";
import type { Inventory } from "../domain";
import { getTileTypeInMap, pointInTileRect, MAP_DEFINITIONS } from "../maps/definitions";
import { canPerformAction, recordSuccessfulAction, type PlayerStats } from "../player/stats";
import { calendarDate, worldMinute } from "../world/calendar";
import type { WeatherId } from "../weather/types";
import { FISH_BITE_DELAY_MINUTES, FISH_BITE_WINDOW_MINUTES, FISH_DEFINITIONS, FISHING_SPOTS } from "./definitions";
import type { FishDefinition, FishId, FishingCast, FishingProgress, FishingSpotId } from "./types";
import type { FamilyPose } from "../family/types";
import { interactionTargetPointFromPosition, playerFeetPointFromPosition } from "../player/interaction";

export const initialFishingProgress = (): FishingProgress => ({ castSequence: 0, caughtFishIds: [] });
export function normalizeFishingProgress(value: unknown): FishingProgress {
  const raw = value && typeof value === "object" && !Array.isArray(value) ? value as Partial<FishingProgress> : {};
  return { castSequence: typeof raw.castSequence === "number" && Number.isSafeInteger(raw.castSequence) && raw.castSequence >= 0 ? raw.castSequence : 0,
    caughtFishIds: Array.isArray(raw.caughtFishIds) ? [...new Set(raw.caughtFishIds.filter((id): id is FishId => typeof id === "string" && Object.hasOwn(FISH_DEFINITIONS, id)))].slice(0, Object.keys(FISH_DEFINITIONS).length) : [] };
}
export function normalizeFishingCast(value: unknown, daySerial: number): FishingCast | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const cast = value as FishingCast;
  const start = worldMinute(daySerial, 0);
  if (cast.daySerial !== daySerial || typeof cast.id !== "string" || !/^\d+:\d+$/.test(cast.id) || cast.id.length > 32 ||
      !Object.hasOwn(FISHING_SPOTS, cast.spotId) || !Object.hasOwn(FISH_DEFINITIONS, cast.fishId) ||
      !Number.isSafeInteger(cast.biteAt) || cast.biteAt < start || cast.biteAt > start + 1440 + FISH_BITE_DELAY_MINUTES ||
      cast.expiresAt !== cast.biteAt + FISH_BITE_WINDOW_MINUTES) return null;
  return { id: cast.id, spotId: cast.spotId, daySerial, fishId: cast.fishId, biteAt: cast.biteAt, expiresAt: cast.expiresAt };
}
export const fishingStage = (cast: FishingCast | null, now: number): "idle" | "waiting" | "bite" | "missed" =>
  !cast ? "idle" : now < cast.biteAt ? "waiting" : now <= cast.expiresAt ? "bite" : "missed";

/** Authored shore and water both matter; the rod must face actual water, not just be near it. */
export function fishingSpotError(spotId: unknown, pose: Pick<FamilyPose, "mapId" | "x" | "y" | "facing" | "selectedTool">): string | null {
  const spot = typeof spotId === "string" ? FISHING_SPOTS[spotId as FishingSpotId] : undefined;
  if (!spot || pose.mapId !== spot.mapId) return "이곳에는 낚시터가 없어요.";
  const map = MAP_DEFINITIONS[spot.mapId];
  const feet = playerFeetPointFromPosition(pose);
  if (pose.selectedTool !== "fishing_rod" || pose.facing !== spot.facing ||
      !pointInTileRect(feet.x, feet.y, spot.shoreArea)) return "연못 북쪽 물가에서 물을 향해 낚싯대를 사용해 주세요.";
  const playerTileX = Math.floor(feet.x / GAME_CONFIG.tileSize), playerTileY = Math.floor(feet.y / GAME_CONFIG.tileSize);
  const target = interactionTargetPointFromPosition(pose, pose.facing);
  if (!map || getTileTypeInMap(map, playerTileX, playerTileY) === "water" ||
      !pointInTileRect(target.x, target.y, spot.waterArea) ||
      getTileTypeInMap(map, Math.floor(target.x / GAME_CONFIG.tileSize), Math.floor(target.y / GAME_CONFIG.tileSize)) !== "water" ||
      Math.hypot(target.x - feet.x, target.y - feet.y) > 64) return "물가 가까이에서 물을 향해 던져 주세요.";
  return null;
}
export function eligibleFish(spotId: FishingSpotId, daySerial: number, weather: WeatherId, timeMinutes: number): FishDefinition[] {
  const season = calendarDate(daySerial).season;
  return Object.values(FISH_DEFINITIONS).filter(f => f.spots.includes(spotId) && f.seasons.includes(season) &&
    f.weather.includes(weather) && timeMinutes >= f.startMinutes && timeMinutes < f.endMinutes);
}
/** Stable weighted roll; the personal sequence is committed with the cast and never provided by the client. */
export function rollFish(scope: string, playerId: string, daySerial: number, spotId: FishingSpotId, sequence: number, candidates: FishDefinition[]): FishDefinition | null {
  if (!candidates.length) return null;
  let hash = 2166136261;
  for (const character of `jiwoos-farm:fishing:v1:${scope}:${playerId}:${daySerial}:${spotId}:${sequence}`)
    hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  let roll = (hash >>> 0) % candidates.reduce((sum, fish) => sum + fish.weight, 0);
  for (const fish of candidates) { if (roll < fish.weight) return fish; roll -= fish.weight; }
  return candidates[candidates.length - 1];
}
export function beginFishing(progress: FishingProgress, active: FishingCast | null, pose: FamilyPose, spotId: FishingSpotId,
  scope: string, playerId: string, daySerial: number, weather: WeatherId, timeMinutes: number, stats: PlayerStats) {
  const error = fishingSpotError(spotId, pose);
  if (error) return { error };
  if (active && active.daySerial === daySerial && fishingStage(active, worldMinute(daySerial, timeMinutes)) !== "missed") return { error: "이미 찌를 던졌어요. 입질을 기다려 주세요." };
  if (!canPerformAction(stats, "fish")) return { error: "체력이 부족합니다. 잠을 자고 회복하세요." };
  const candidates = eligibleFish(spotId, daySerial, weather, timeMinutes), sequence = progress.castSequence + 1;
  if (!Number.isSafeInteger(sequence)) return { error: "낚시 기록을 저장할 수 없어요." };
  const fish = rollFish(scope, playerId, daySerial, spotId, sequence, candidates);
  if (!fish) return { error: "지금 이 연못에서는 물고기가 보이지 않아요." };
  const biteAt = worldMinute(daySerial, timeMinutes) + FISH_BITE_DELAY_MINUTES;
  return { progress: { ...progress, castSequence: sequence }, cast: { id: `${daySerial}:${sequence}`, spotId, daySerial, fishId: fish.id,
    biteAt, expiresAt: biteAt + FISH_BITE_WINDOW_MINUTES } satisfies FishingCast };
}
export function reelFishing(cast: FishingCast | null, castId: string, progress: FishingProgress, inventory: Inventory,
  stats: PlayerStats, daySerial: number, timeMinutes: number) {
  if (!cast || cast.id !== castId) return { error: "이미 끝난 낚시예요. 다시 던져 주세요." };
  if (cast.daySerial !== daySerial) return { cast: null, failed: true, message: "날짜가 바뀌어 낚시가 취소됐어요." };
  const stage = fishingStage(cast, worldMinute(daySerial, timeMinutes));
  if (stage === "waiting") return { error: "아직 입질이 없어요. 조금만 기다려 주세요." };
  if (stage === "missed") return { cast: null, failed: true, message: "입질을 놓쳤어요. 다시 던져 보세요." };
  if (!canPerformAction(stats, "fish")) return { error: "체력이 부족합니다. 잠을 자고 회복하세요." };
  const fish = FISH_DEFINITIONS[cast.fishId];
  if (!fish) return { error: "낚시 결과가 올바르지 않아요." };
  inventory.add(fish.itemId);
  recordSuccessfulAction(stats, "fish");
  if (!progress.caughtFishIds.includes(fish.id)) progress.caughtFishIds.push(fish.id);
  return { cast: null, fish, message: `${fish.name}를 낚았어요!` };
}
