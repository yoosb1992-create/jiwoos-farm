import type { Entity } from "./world.js";
import type { Tool } from "./interaction.js";
import { naturalFlower, rockClass } from "./resources.js";

/** Server action costs; misses use the same tool base price. Keep the existing
 * cheaper twig/stone/flower work, and charge only once at the action boundary. */
export const TOOL_STAMINA_COST: Readonly<Record<Tool, number>> = {
  axe: 3, pickaxe: 3, hoe: 2, scythe: 1, water: 1,
};
export const HAND_STAMINA_COST = { gather: 1, harvest: 1, pickup: 0 } as const;
export const FISHING_CAST_STAMINA_COST = 3;
export function toolStaminaCost(tool: Tool, target?: Entity): number {
  if (target && ((tool === "axe" && target.kind === "twig") ||
    (tool === "pickaxe" && target.kind === "rock" && rockClass(target) === "stone") ||
    ((tool === "axe" || tool === "pickaxe") && naturalFlower(target)))) return 1;
  return TOOL_STAMINA_COST[tool];
}
