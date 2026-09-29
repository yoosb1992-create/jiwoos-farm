import type { Facing, VisualAssetDefinition } from "../assets/definitions";
import type { ItemId } from "../data/items";
export interface NpcPoint { x: number; y: number }
/** Tile coordinates are cell indices; actors stand at cell centres. */
export interface NpcScheduleStep {
  minute: number; mapId: string; from: NpcPoint; to: NpcPoint; facing: Facing;
  activity: string; days?: number[];
}
export interface NpcDialogueData {
  first: string[]; general: string[][]; morning: string[][]; afternoon: string[][]; evening: string[][];
  progress: { minDay: number; lines: string[] }[];
  relationship?: { minPoints: number; lines: string[] }[];
}
export interface NpcDefinition {
  id: string; name: string; displayName: string; personality: string;
  asset: VisualAssetDefinition; fallbackColor: number;
  speed: number; schedule: NpcScheduleStep[]; dialogue: NpcDialogueData;
  giftPreferences: { loved: readonly ItemId[]; neutral: readonly ItemId[]; disliked: readonly ItemId[] };
}
export interface NpcPose extends NpcPoint {
  npcId: string; mapId: string; facing: Facing; moving: boolean; activity: string;
}
