import { SEASON_DAYS, SEASONS, type Season } from "./expansion.js";

/** Presentation-only light. World.minute/day remain the shared server clock.
 * No saved fields or growth-rate changes: future sun/weather/shade systems can
 * supply this input without teaching the crop renderer about calendars. */
export interface SunlightProfile {
  sunrise: number;
  sunset: number;
  dawnMinutes: number;
  duskMinutes: number;
  peakIntensity: number;
  /** Radians above the ground plane at solar noon. */
  maxElevation: number;
}
export const DEFAULT_SUNLIGHT: Readonly<SunlightProfile> = {
  sunrise: 390, sunset: 1125, dawnMinutes: 90, duskMinutes: 120,
  peakIntensity: .96, maxElevation: 67 * Math.PI / 180,
};
/** Mid-season anchors, not stepwise seasonal switches. */
export const SEASONAL_SUNLIGHT: Readonly<Record<Season, SunlightProfile>> = {
  spring: { ...DEFAULT_SUNLIGHT },
  summer: { ...DEFAULT_SUNLIGHT, sunrise: 330, sunset: 1200, peakIntensity: 1, maxElevation: 78 * Math.PI / 180 },
  autumn: { ...DEFAULT_SUNLIGHT },
  winter: { ...DEFAULT_SUNLIGHT, sunrise: 450, sunset: 1050, peakIntensity: .92, maxElevation: 56 * Math.PI / 180 },
};
export const SOLAR_YEAR_DAYS = SEASON_DAYS * SEASONS.length;
/** World.day is one-based. The solstice lies halfway through summer 14–15.
 * Fractional days are supported; all values and their derivatives wrap annually. */
export function sunlightProfile(day: number): SunlightProfile {
  const yearDay = ((day - 1) % SOLAR_YEAR_DAYS + SOLAR_YEAR_DAYS) % SOLAR_YEAR_DAYS + 1;
  const wave = Math.cos(2 * Math.PI * (yearDay - (SEASON_DAYS * 1.5 + .5)) / SOLAR_YEAR_DAYS);
  const summer = SEASONAL_SUNLIGHT.summer, winter = SEASONAL_SUNLIGHT.winter;
  const blend = (a: number, b: number) => (a + b) / 2 + (a - b) / 2 * wave;
  return {
    ...DEFAULT_SUNLIGHT,
    sunrise: blend(summer.sunrise, winter.sunrise),
    sunset: blend(summer.sunset, winter.sunset),
    peakIntensity: blend(summer.peakIntensity, winter.peakIntensity),
    maxElevation: blend(summer.maxElevation, winter.maxElevation),
  };
}
export interface LightInput {
  minute: number;
  /** Authoritative World.day; takes precedence over the season-only fallback. */
  day?: number;
  season?: Season;
  profile?: Partial<SunlightProfile>;
  sunlightIntensity?: number;
  seasonalSunModifier?: number;
  exposure?: number;
  /** Rain clouds attenuate daylight, retaining the existing lunar/night floor. */
  cloudReduction?: number;
}
const clamp = (n: number) => Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;
const smooth = (n: number) => { const t = clamp(n); return t * t * (3 - 2 * t); };
export interface SunState extends SunlightProfile {
  dayLength: number;
  solarNoon: number;
  /** Radians: east = 0, south (+world Y) = PI/2, west = PI. */
  sunAzimuth: number;
  /** Signed radians; negative means below the horizon. */
  sunElevation: number;
  /** Unit vector FROM the ground TOWARD the sun. X=east, Y=south, Z=up.
   * Incoming light travels along its negative. Camera position is irrelevant. */
  sunDirectionX: number;
  sunDirectionY: number;
  sunDirectionZ: number;
  /** Unit ground-plane vector pointing AWAY from the sun. */
  shadowDirectionX: number;
  shadowDirectionY: number;
  /** Ground distance per unit object height, bounded near the horizon. */
  shadowLength: number;
  sunlightIntensity: number;
  ambientLight: number;
  moonlight: number;
  season: Season;
  /** Warm low-sun contribution, zero at night and near midday. */
  warmth: number;
}
function solarOrbit(p: SunlightProfile, minute: number): number {
  if (minute >= p.sunrise && minute <= p.sunset)
    return Math.PI * (minute - p.sunrise) / (p.sunset - p.sunrise);
  const afterSunset = (minute < p.sunrise ? minute + 1440 : minute) - p.sunset;
  return Math.PI + Math.PI * afterSunset / (1440 - (p.sunset - p.sunrise));
}
function sunPosition(p: SunlightProfile, minute: number) {
  const sunAzimuth = solarOrbit(p, minute);
  const sunElevation = p.maxElevation * Math.sin(sunAzimuth);
  const horizontal = Math.cos(sunElevation);
  return {
    sunAzimuth, sunElevation,
    sunDirectionX: Math.cos(sunAzimuth) * horizontal,
    sunDirectionY: Math.sin(sunAzimuth) * horizontal,
    sunDirectionZ: Math.sin(sunElevation),
    shadowDirectionX: -Math.cos(sunAzimuth),
    shadowDirectionY: -Math.sin(sunAzimuth),
    shadowLength: sunElevation > 0 ? Math.min(2.8, 1 / Math.tan(sunElevation)) : 0,
  };
}
/** Pure and deterministic: no device clock, network messages or saved fields.
 * Renderers, future windows and weather can all consume the same result. */
export function getSunState(input: LightInput): SunState {
  const fallbackDay = Math.max(0, SEASONS.indexOf(input.season ?? "spring")) * SEASON_DAYS + (SEASON_DAYS + 1) / 2;
  const p = { ...sunlightProfile(Number.isFinite(input.day) ? input.day! : fallbackDay), ...input.profile };
  const minute = ((input.minute % 1440) + 1440) % 1440;
  const position = sunPosition(p, minute);
  const aboveHorizon = minute > p.sunrise && minute < p.sunset;
  const daylight = aboveHorizon ? smooth(Math.sin(position.sunAzimuth)) : 0;
  const sunlightIntensity = aboveHorizon ? clamp((input.sunlightIntensity ?? daylight * p.peakIntensity) *
    (input.seasonalSunModifier ?? 1) * (input.exposure ?? 1) * (1-clamp(input.cloudReduction ?? 0))) : 0;
  const day=Number.isFinite(input.day)?input.day!:fallbackDay;
  const season=SEASONS[((Math.floor((day-1)/SEASON_DAYS)%4)+4)%4]!;
  // A deterministic 28-day lunar cycle: only nights close to full moon gain
  // a little visibility. No local wall clock or persisted phase is necessary.
  const lunarPhase=((day-1)%28+28)%28/28;
  const moonlight=.055*((1-Math.cos(lunarPhase*Math.PI*2))/2)**6;
  const nightFloor=.018+moonlight;
  const sky = smooth((minute - p.sunrise + p.dawnMinutes / 2) / p.dawnMinutes) *
    smooth((p.sunset + p.duskMinutes / 2 - minute) / p.duskMinutes);
  const ambientLight = Math.min(1,nightFloor+(1-nightFloor)*sky*(1-clamp(input.cloudReduction ?? 0)));
  const warmth = aboveHorizon ? smooth(daylight * 5) * (1 - smooth(daylight / .72)) : 0;
  return { ...p, ...position, dayLength: p.sunset - p.sunrise,
    solarNoon: (p.sunrise + p.sunset) / 2, sunlightIntensity, ambientLight, moonlight, season, warmth };
}
export function currentLightLevel(input: LightInput): number {
  return getSunState(input).sunlightIntensity;
}
/** Glow never replaces the physical seed sprite. Exactly zero means no halo or sparkle. */
export function seedGlowVisibility(lightLevel: number): number { return clamp(lightLevel) * .72; }
