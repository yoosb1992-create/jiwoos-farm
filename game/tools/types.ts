import type { ItemId } from "../data/items";

export type GrowingTool = "axe" | "pickaxe";
export interface ToolProgression { axe: number; pickaxe: number }
export interface ToolLevelDefinition {
  level: number;
  name: string;
  resourcePower: number;
  materials: readonly { itemId: ItemId; quantity: number }[];
}
export interface ToolUpgradeDefinition {
  id: string;
  tool: GrowingTool;
  fromLevel: number;
  toLevel: number;
  name: string;
  materials: ToolLevelDefinition["materials"];
}
