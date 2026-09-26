export interface FamilyRoom { id: string; name: string; inviteCode: string; playerId: string; nickname: string }
export interface FamilyMember { playerId: string; nickname: string }
export interface FamilyRoomDetail { room: FamilyRoom; members: FamilyMember[] }

import type { FarmTileData, InventoryData, PlayerData } from "../domain";
import type { ToolKey } from "../events";
export interface FamilyPose extends PlayerData { selectedTool: ToolKey; moving: boolean }
export interface FamilyWorld { day: number; timeMinutes: number; money: number; farm: FarmTileData[] }
export interface FamilySnapshot { revision: number; serverNow: number; world: FamilyWorld; inventory: InventoryData }
export type FamilyAction =
  | { kind: "tool"; tool: ToolKey; x: number; y: number; pose: FamilyPose }
  | { kind: "buy"; listingId: string; pose: FamilyPose }
  | { kind: "sleep" | "sell"; pose: FamilyPose };
export interface FamilySession { room: FamilyRoom }
