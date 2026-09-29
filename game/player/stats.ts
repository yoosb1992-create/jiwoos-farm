import { SKILL_ACTIONS } from "../skills/definitions";
import { awardExperience, initialSkills, normalizeSkills } from "../skills/progression";
import type { SkillAction, SkillProgression } from "../skills/types";

export const BASE_MAX_STAMINA = 100;
export interface PlayerStats { stamina: number; maxStamina: number; skills: SkillProgression }
export const initialPlayerStats = (): PlayerStats => ({ stamina: BASE_MAX_STAMINA, maxStamina: BASE_MAX_STAMINA, skills: initialSkills() });
export function normalizePlayerStats(value: unknown): PlayerStats {
  if (!value || typeof value !== "object" || Array.isArray(value)) return initialPlayerStats();
  const raw = value as Record<string, unknown>;
  const maxStamina = Number.isSafeInteger(raw.maxStamina) && (raw.maxStamina as number) > 0 && (raw.maxStamina as number) <= 10_000
    ? raw.maxStamina as number : BASE_MAX_STAMINA;
  const stamina = Number.isSafeInteger(raw.stamina) ? Math.max(0, Math.min(maxStamina, raw.stamina as number)) : maxStamina;
  return { stamina, maxStamina, skills: normalizeSkills(raw.skills) };
}
export const canPerformAction = (stats: PlayerStats, action: SkillAction): boolean => stats.stamina >= SKILL_ACTIONS[action].stamina;
/** Call only after a validated, successful action; preflight with canPerformAction before any mutation. */
export function recordSuccessfulAction(stats: PlayerStats, action: SkillAction): boolean {
  if (!canPerformAction(stats, action)) return false;
  const definition = SKILL_ACTIONS[action];
  stats.stamina -= definition.stamina;
  return awardExperience(stats.skills, definition.skill, definition.experience);
}
export function restoreStamina(stats: PlayerStats): void { stats.stamina = stats.maxStamina; }
