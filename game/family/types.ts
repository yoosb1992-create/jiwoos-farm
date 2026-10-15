export interface FamilyRoom { isOwner?: boolean; id: string; name: string; inviteCode: string; playerId: string; nickname: string }
export interface FamilyMember { online?: boolean; playerId: string; nickname: string }
export interface FamilyRoomDetail { room: FamilyRoom; members: FamilyMember[] }

import type { FarmTileData, InventoryData, PlayerData } from "../domain";
import type { ToolKey } from "../events";
import type { ForestState } from "../forest/resources";
import type { ToolProgression } from "../tools/types";
export interface FamilyPose extends PlayerData { selectedTool: ToolKey; moving: boolean }
export interface FamilyWorld { daySerial?:number; forestState?: ForestState; day: number; timeMinutes: number; money: number; farm: FarmTileData[] }
export interface FamilySnapshot { npcTimeMinutes?: number; toolProgression?: ToolProgression; revision: number; serverNow: number; world: FamilyWorld; inventory: InventoryData; sleep?: { waiting: string[]; agreed: number; online: number; voted: boolean } }
export type FamilyAction =
  | { kind: "tool"; tool: ToolKey; cropId?: import("../data/crops").CropId; x: number; y: number; pose: FamilyPose }
  | { kind: "forest-gather"; nodeId: string; daySerial: number; tool: ToolKey; pose: FamilyPose }
  | { kind: "buy"; listingId: string; pose: FamilyPose }
  | { kind: "craft"; recipeId: string; pose: FamilyPose }
  | { kind: "tool-upgrade"; upgradeId: string; pose: FamilyPose }
  | { kind: "sleep" | "sleep-cancel" | "sell"; pose: FamilyPose };
export interface FamilySession { room: FamilyRoom }
export interface FamilyToolAction { id: string; tool: ToolKey; facing: FamilyPose["facing"]; expiresAt: number }
export interface FamilyPresence extends FamilyPose { action?: FamilyToolAction; playerId: string; nickname: string; lastSeen: number }
export interface FamilyPresenceSnapshot { players: FamilyPresence[]; serverNow: number }
