export type SkillId = "farming" | "foraging" | "mining" | "fishing";
export interface SkillProgress { level: number; experience: number }
export type SkillProgression = Record<SkillId, SkillProgress>;
export type SkillAction = "hoe" | "water" | "harvest" | "axe" | "pickaxe" | "forage" | "fish";
export interface SkillDefinition { id: SkillId; name: string }
export interface SkillActionDefinition { skill: SkillId; experience: number; stamina: number }
