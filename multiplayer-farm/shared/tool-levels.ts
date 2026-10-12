import type { Member } from "./world.js";

export const UPGRADE_TOOLS = ["axe", "pickaxe", "hoe", "scythe", "water", "fishing_rod"] as const;
export type UpgradeTool = typeof UPGRADE_TOOLS[number];
export const isUpgradeTool = (id?: string): id is UpgradeTool => UPGRADE_TOOLS.includes(id as UpgradeTool);
export const toolLevel = (member: Pick<Member, "toolLevel" | "toolLevels">, tool: UpgradeTool): number =>
  Math.max(1, Math.min(2, member.toolLevels?.[tool] ?? member.toolLevel ?? 1));
/** Freeze the old common level once. Later upgrades change exactly one entry. */
export function migrateToolLevels(member: Member): void {
  member.toolLevels ??= {};
  for (const tool of UPGRADE_TOOLS) member.toolLevels[tool] ??= toolLevel(member, tool);
}
export const TOOL_UPGRADES: Partial<Record<UpgradeTool, { effect: string; materials: Record<string, number> }>> = {
  axe: { effect: "성목에 가하는 도끼 피해 1 → 2 (그루터기는 기존 규칙 유지)", materials: { copper_ore: 5, wood: 5 } },
  pickaxe: { effect: "바위와 광석에 가하는 곡괭이 피해 1 → 2", materials: { copper_ore: 5, wood: 5 } },
};
