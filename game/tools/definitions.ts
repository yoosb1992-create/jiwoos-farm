import type { ToolLevelDefinition, ToolUpgradeDefinition, ToolProgression } from "./types";

export const INITIAL_TOOL_PROGRESSION: ToolProgression = { axe: 1, pickaxe: 0 };
export const TOOL_LEVELS = {
  axe: {
    1: { level: 1, name: "기본 도끼", resourcePower: 1, materials: [] },
    2: { level: 2, name: "튼튼한 도끼", resourcePower: 2, materials: [{ itemId: "wood_plank", quantity: 3 }, { itemId: "stone_block", quantity: 2 }] },
  },
  pickaxe: {
    1: { level: 1, name: "기본 곡괭이", resourcePower: 1, materials: [{ itemId: "wood_plank", quantity: 2 }, { itemId: "stone_block", quantity: 1 }] },
  },
} as const satisfies Record<keyof ToolProgression, Record<number, ToolLevelDefinition>>;

export const TOOL_UPGRADES = {
  pickaxe_unlock: { id: "pickaxe_unlock", tool: "pickaxe", fromLevel: 0, toLevel: 1, name: "곡괭이 해금", materials: TOOL_LEVELS.pickaxe[1].materials },
  axe_2: { id: "axe_2", tool: "axe", fromLevel: 1, toLevel: 2, name: "도끼 Lv2", materials: TOOL_LEVELS.axe[2].materials },
} as const satisfies Record<string, ToolUpgradeDefinition>;
export type ToolUpgradeId = keyof typeof TOOL_UPGRADES;
export const getToolUpgrade = (id: unknown): ToolUpgradeDefinition | null =>
  typeof id === "string" && Object.hasOwn(TOOL_UPGRADES, id) ? TOOL_UPGRADES[id as ToolUpgradeId] : null;
