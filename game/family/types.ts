export interface FamilyRoom { isOwner?: boolean; id: string; name: string; inviteCode: string; playerId: string; nickname: string }
export interface FamilyMember { online?: boolean; playerId: string; nickname: string }
export interface FamilyRoomDetail { room: FamilyRoom; members: FamilyMember[] }

import type { FarmTileData, InventoryData, PlayerData } from "../domain";
import type { ToolKey } from "../events";
import type { ForestState } from "../forest/resources";
import type { ToolProgression } from "../tools/types";
import type { PlayerStats } from "../player/stats";
import type { StorageData, ContainerId, StorageDirection, StorageTransfer } from "../storage/types";
import type { PlaceablesData, PlaceableId } from "../placeables/types";
import type { BuildingsData, BuildingId } from "../buildings/types";
import type { FarmProgress, ExpansionId } from "../farm/expansions";
import type { MineDailyState, MineProgress } from "../mine/types";
import type { FishingCast, FishingProgress, FishingSpotId } from "../fishing/types";
import type { AnimalSpeciesId, RanchState } from "../animals/types";
import type { WateringCanState } from "../tools/wateringCan";
import type { FarmTreeState } from "../farm/trees";
export interface FamilyPose extends PlayerData { selectedTool: ToolKey; moving: boolean }
export interface FamilyWorld { ranchState?: RanchState; mineProgress?: MineProgress; mineDaily?: MineDailyState; buildings?: BuildingsData; farmProgress?: FarmProgress; placeables?: PlaceablesData; storage?: StorageData; daySerial?:number; forestState?: ForestState; farmTreeState?: FarmTreeState; day: number; timeMinutes: number; money: number; farm: FarmTileData[] }
export interface FamilySnapshot { wateringCan?: WateringCanState; fishingProgress?: FishingProgress; fishingCast?: FishingCast | null; fishingNotice?: string; npcTimeMinutes?: number; toolProgression?: ToolProgression; stats?: PlayerStats; revision: number; serverNow: number; world: FamilyWorld; inventory: InventoryData; sleep?: { waiting: string[]; agreed: number; online: number; voted: boolean } }
export type FamilyAction =
  | { kind: "animal-buy"; species: AnimalSpeciesId; homeBuildingId: string; pose: FamilyPose }
  | { kind: "animal-feed"; homeBuildingId: string; pose: FamilyPose }
  | { kind: "animal-pet"; animalId: string; pose: FamilyPose }
  | { kind: "animal-collect"; animalId: string; pose: FamilyPose }
  | { kind: "fish-cast"; spotId: FishingSpotId; pose: FamilyPose }
  | { kind: "fish-reel"; castId: string; pose: FamilyPose }
  | { kind: "build"; definitionId: BuildingId; tileX: number; tileY: number; pose: FamilyPose }
  | { kind: "farm-expand"; expansionId: ExpansionId; pose: FamilyPose }
  | { kind: "tool"; tool: ToolKey; cropId?: import("../data/crops").CropId; x: number; y: number; pose: FamilyPose }
  | { kind: "water-refill"; pose: FamilyPose }
  | { kind: "forest-gather"; nodeId: string; daySerial: number; tool: ToolKey; pose: FamilyPose }
  | { kind: "farm-tree-hit"; nodeId: string; tool: "axe"; pose: FamilyPose }
  | { kind: "mine-hit"; floor: number; nodeId: string; daySerial: number; tool: ToolKey; pose: FamilyPose }
  | { kind: "buy"; listingId: string; pose: FamilyPose }
  | { kind: "craft"; recipeId: string; pose: FamilyPose }
  | { kind: "tool-upgrade"; upgradeId: string; pose: FamilyPose }
  | { kind: "consume-food"; itemId: import("../data/food").FoodItemId; pose: FamilyPose }
  | { kind: "storage"; containerId: ContainerId; direction: StorageDirection; itemId: import("../data/items").ItemId; quantity: number; pose: FamilyPose }
  | { kind: "storage-batch"; containerId: ContainerId; transfers: StorageTransfer[]; pose: FamilyPose }
  | { kind: "place"; definitionId: PlaceableId; tileX: number; tileY: number; pose: FamilyPose }
  | { kind: "place-remove"; instanceId: string; pose: FamilyPose }
  | { kind: "machine-start"; instanceId: string; processId: string; pose: FamilyPose }
  | { kind: "machine-collect"; instanceId: string; pose: FamilyPose }
  | { kind: "sleep" | "sleep-cancel" | "sell"; pose: FamilyPose };
export interface FamilySession { room: FamilyRoom }
export interface FamilyToolAction { id: string; tool: ToolKey; facing: FamilyPose["facing"]; expiresAt: number }
export interface FamilyPresence extends FamilyPose { action?: FamilyToolAction; playerId: string; nickname: string; lastSeen: number }
export interface FamilyPresenceSnapshot { players: FamilyPresence[]; serverNow: number }
