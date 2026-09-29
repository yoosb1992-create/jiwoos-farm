import { GAME_CONFIG } from "../config";

export const SEASONS = ["spring", "summer", "autumn", "winter"] as const;
export type Season = typeof SEASONS[number];
export const SEASON_NAMES: Record<Season, string> = { spring: "봄", summer: "여름", autumn: "가을", winter: "겨울" };
export interface CalendarDate { year: number; season: Season; day: number; daySerial: number }
/** Continuous game minutes; sleeping skips the remaining night without relying on wall time. */
export function worldMinute(daySerial: number, timeMinutes: number): number {
  if (!Number.isSafeInteger(daySerial) || daySerial < 1 || !Number.isFinite(timeMinutes) || timeMinutes < 0 || timeMinutes >= 1440) throw new Error("Invalid world time");
  return (daySerial - 1) * 1440 + Math.floor(timeMinutes);
}

/** Day 1 is year 1, spring 1. The serial is the only persisted calendar source. */
export function calendarDate(daySerial: number): CalendarDate {
  if (!Number.isSafeInteger(daySerial) || daySerial < 1) throw new Error("Invalid daySerial");
  const offset = daySerial - 1, daysPerSeason = GAME_CONFIG.day.daysPerSeason;
  return {
    year: Math.floor(offset / (daysPerSeason * SEASONS.length)) + 1,
    season: SEASONS[Math.floor(offset / daysPerSeason) % SEASONS.length],
    day: offset % daysPerSeason + 1,
    daySerial,
  };
}
