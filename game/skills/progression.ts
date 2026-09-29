import { experienceForLevel, MAX_SKILL_LEVEL, SKILL_DEFINITIONS } from "./definitions";
import type { SkillId, SkillProgression } from "./types";

export const initialSkills = (): SkillProgression => ({
  farming: { level: 1, experience: 0 }, foraging: { level: 1, experience: 0 }, mining: { level: 1, experience: 0 }, fishing: { level: 1, experience: 0 },
});
const safeExperience = (value: unknown) => Number.isSafeInteger(value) && (value as number) >= 0 ? value as number : 0;
export function levelForExperience(experience: number): number {
  let level = 1;
  while (level < MAX_SKILL_LEVEL && experience >= experienceForLevel(level + 1)) level++;
  return level;
}
export function normalizeSkills(value: unknown): SkillProgression {
  const raw = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const skills = initialSkills();
  for (const id of Object.keys(SKILL_DEFINITIONS) as SkillId[]) {
    const progress = raw[id];
    const xp = progress && typeof progress === "object" && !Array.isArray(progress)
      ? safeExperience((progress as Record<string, unknown>).experience) : 0;
    skills[id] = { experience: xp, level: levelForExperience(xp) };
  }
  return skills;
}
export function awardExperience(skills: SkillProgression, id: SkillId, amount: number): boolean {
  if (!Number.isSafeInteger(amount) || amount <= 0) return false;
  const current = skills[id];
  current.experience = Math.min(Number.MAX_SAFE_INTEGER, current.experience + amount);
  const priorLevel = current.level;
  current.level = levelForExperience(current.experience);
  return current.level > priorLevel;
}
export const nextLevelExperience = (level: number): number | null =>
  level < MAX_SKILL_LEVEL ? experienceForLevel(level + 1) : null;
