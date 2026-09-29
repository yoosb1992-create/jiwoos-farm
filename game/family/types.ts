export interface FamilyRoom { isOwner?: boolean; id: string; name: string; inviteCode: string; playerId: string; nickname: string }
export interface FamilyMember { online?: boolean; playerId: string; nickname: string }
export interface FamilyRoomDetail { room: FamilyRoom; members: FamilyMember[] }

import type { FarmTileData, InventoryData, PlayerData } from "../domain";
import type { ToolKey } from "../events";
import type { ForestState } from "../forest/resources";
import type { ToolProgression } from "../tools/types";
import type { PlayerStats } from "../player/stats";
import type { StorageData, ContainerId, StorageDirection } from "../storage/types";
import type { PlaceablesData, PlaceableId } from "../placeables/types";
import type { BuildingsData, BuildingId } from "../buildings/types";
import type { FarmProgress, ExpansionId } from "../farm/expansions";
export interface FamilyPose extends PlayerData { selectedTool: ToolKey; moving: boolean }
export interface FamilyWorld { buildings?: BuildingsData; farmProgress?: FarmProgress; placeables?: PlaceablesData; storage?: StorageData; daySerial?:number; forestState?: ForestState; day: number; timeMinutes: number; money: number; farm: FarmTileData[] }
export interface FamilySnapshot { npcTimeMinutes?: number; toolProgression?: ToolProgression; stats?: PlayerStats; revision: number; serverNow: number; world: FamilyWorld; inventory: InventoryData; sleep?: { waiting: string[]; agreed: number; online: number; voted: boolean } }
export type FamilyAction =
  | { kind: "build"; definitionId: BuildingId; tileX: number; tileY: number; pose: FamilyPose }
  | { kind: "farm-expand"; expansionId: ExpansionId; pose: FamilyPose }
  | { kind: "tool"; tool: ToolKey; cropId?: import("../data/crops").CropId; x: number; y: number; pose: FamilyPose }
  | { kind: "forest-gather"; nodeId: string; daySerial: number; tool: ToolKey; pose: FamilyPose }
  | { kind: "buy"; listingId: string; pose: FamilyPose }
  | { kind: "craft"; recipeId: string; pose: FamilyPose }
  | { kind: "tool-upgrade"; upgradeId: string; pose: FamilyPose }
  | { kind: "storage"; containerId: ContainerId; direction: StorageDirection; itemId: import("../data/items").ItemId; quantity: number; pose: FamilyPose }
  | { kind: "place"; definitionId: PlaceableId; tileX: number; tileY: number; pose: FamilyPose }
  | { kind: "place-remove"; instanceId: string; pose: FamilyPose }
  | { kind: "machine-start"; instanceId: string; processId: string; pose: FamilyPose }
  | { kind: "machine-collect"; instanceId: string; pose: FamilyPose }
  | { kind: "sleep" | "sleep-cancel" | "sell"; pose: FamilyPose };
export interface FamilySession { room: FamilyRoom }
export interface FamilyToolAction { id: string; tool: ToolKey; facing: FamilyPose["facing"]; expiresAt: number }
export interface FamilyPresence extends FamilyPose { action?: FamilyToolAction; playerId: string; nickname: string; lastSeen: number }
export interface FamilyPresenceSnapshot { players: FamilyPresence[]; serverNow: number }
