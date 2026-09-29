import type { Inventory } from "../domain";
import { INITIAL_TOOL_PROGRESSION, TOOL_LEVELS } from "./definitions";
import type { GrowingTool, ToolProgression, ToolUpgradeDefinition } from "./types";

export function normalizeToolProgression(value: unknown): ToolProgression {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ...INITIAL_TOOL_PROGRESSION };
  const raw = value as Record<string, unknown>;
  return {
    axe: Number.isInteger(raw.axe) && (raw.axe === 1 || raw.axe === 2) ? raw.axe as number : 1,
    pickaxe: raw.pickaxe === 1 ? 1 : 0,
  };
}

export const toolPower = (progress: ToolProgression, tool: GrowingTool): number => {
  const level = progress[tool];
  const definition = (TOOL_LEVELS[tool] as Record<number, { resourcePower: number }>)[level];
  return definition?.resourcePower ?? 0;
};

export const canUpgradeTool = (inventory: Inventory, progress: ToolProgression, upgrade: ToolUpgradeDefinition) =>
  progress[upgrade.tool] === upgrade.fromLevel && upgrade.materials.every(m => inventory.count(m.itemId) >= m.quantity);

/** Trusted upgrade definitions only; inventory and personal progress change together in memory. */
export function upgradeTool(inventory: Inventory, progress: ToolProgression, upgrade: ToolUpgradeDefinition): boolean {
  if (!canUpgradeTool(inventory, progress, upgrade)) return false;
  for (const material of upgrade.materials) inventory.consume(material.itemId, material.quantity);
  progress[upgrade.tool] = upgrade.toLevel;
  return true;
}
