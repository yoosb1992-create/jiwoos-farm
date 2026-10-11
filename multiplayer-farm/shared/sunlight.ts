import type { Season } from "./expansion.js";

/** Presentation-only light. World.minute/day remain the shared server clock.
 * No saved fields or growth-rate changes: future sun/weather/shade systems can
 * supply this input without teaching the crop renderer about calendars. */
export interface SunlightProfile {
  sunrise: number;
  sunset: number;
  dawnMinutes: number;
  duskMinutes: number;
  peakIntensity: number;
}
export const DEFAULT_SUNLIGHT: Readonly<SunlightProfile> = {
  sunrise: 360, sunset: 1140, dawnMinutes: 90, duskMinutes: 120, peakIntensity: 1,
};
// Intentionally neutral for now; season-specific daylight is a future feature.
export const SEASONAL_SUNLIGHT: Partial<Record<Season, Partial<SunlightProfile>>> = {};
export interface LightInput {
  minute: number;
  season?: Season;
  profile?: Partial<SunlightProfile>;
  sunlightIntensity?: number;
  seasonalSunModifier?: number;
  exposure?: number;
}
const clamp = (n: number) => Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;
const smooth = (n: number) => { const t = clamp(n); return t * t * (3 - 2 * t); };
export function currentLightLevel(input: LightInput): number {
  const p = { ...DEFAULT_SUNLIGHT, ...(input.season ? SEASONAL_SUNLIGHT[input.season] : {}), ...input.profile };
  const minute = ((input.minute % 1440) + 1440) % 1440;
  const daylight = minute <= p.sunrise || minute >= p.sunset ? 0
    : smooth((minute - p.sunrise) / Math.max(1, p.dawnMinutes)) *
      smooth((p.sunset - minute) / Math.max(1, p.duskMinutes));
  return clamp((input.sunlightIntensity ?? daylight * p.peakIntensity) *
    (input.seasonalSunModifier ?? 1) * (input.exposure ?? 1));
}
/** Glow never replaces the physical seed sprite. Exactly zero means no halo or sparkle. */
export function seedGlowVisibility(lightLevel: number): number { return clamp(lightLevel) * .72; }
