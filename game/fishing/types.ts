import type { ItemId } from "../data/items";
import type { Facing } from "../assets/definitions";
import type { TileRect } from "../maps/types";
import type { Season } from "../world/calendar";
import type { WeatherId } from "../weather/types";

export type FishId = "minnow" | "crucian" | "carp" | "catfish";
export type FishingSpotId = "farm_pond";
export interface FishingSpotDefinition {
  id: FishingSpotId; name: string; mapId: string; waterArea: TileRect; shoreArea: TileRect; facing: Facing;
}
export interface FishDefinition {
  id: FishId; itemId: ItemId; name: string; seasons: readonly Season[]; weather: readonly WeatherId[];
  startMinutes: number; endMinutes: number; spots: readonly FishingSpotId[];
  weight: number; rarity: "common" | "uncommon" | "rare"; sellPrice: number;
}
export interface FishingProgress { castSequence: number; caughtFishIds: FishId[] }
export interface FishingCast {
  id: string; spotId: FishingSpotId; daySerial: number; fishId: FishId;
  biteAt: number; expiresAt: number;
}
