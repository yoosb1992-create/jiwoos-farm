import type { SkillAction, SkillActionDefinition, SkillDefinition, SkillId } from "./types";

export const MAX_SKILL_LEVEL = 20;
export const SKILL_DEFINITIONS: Record<SkillId, SkillDefinition> = {
  farming: { id: "farming", name: "농사" },
  foraging: { id: "foraging", name: "채집" },
  mining: { id: "mining", name: "채광" },
  fishing: { id: "fishing", name: "낚시" },
};
/** Total XP required to enter a level. Increase MAX_SKILL_LEVEL to extend the curve. */
export const experienceForLevel = (level: number) => 25 * (level - 1) ** 2;
export const SKILL_ACTIONS: Record<SkillAction, SkillActionDefinition> = {
  hoe: { skill: "farming", experience: 3, stamina: 4 },
  water: { skill: "farming", experience: 2, stamina: 3 },
  harvest: { skill: "farming", experience: 6, stamina: 0 },
  axe: { skill: "foraging", experience: 3, stamina: 6 },
  pickaxe: { skill: "mining", experience: 4, stamina: 7 },
  forage: { skill: "foraging", experience: 2, stamina: 0 },
  fish: { skill: "fishing", experience: 6, stamina: 5 },
};
