import type { World } from "./world.js";

export const RAIN_KINDS = ["drizzle", "rain", "shower", "storm"] as const;
export type RainKind = typeof RAIN_KINDS[number];
export interface RainProfile {
  name: string; size: number; length: number; thickness: number;
  speed: number; density: number; alpha: number; angle: number;
  cloudReduction: number; thunderChance: number; lightningChance: number;
}
/** Probabilities are per eligible 80 game-minute interval, never per frame.
 * Lightning is a subset of thunder; distant sound-only events remain possible. */
export const RAIN: Readonly<Record<RainKind, RainProfile>> = {
  drizzle: {name:"가랑비",size:.7,length:7,thickness:.7,speed:135,density:.65,alpha:.35,angle:.06,cloudReduction:.12,thunderChance:0,lightningChance:0},
  rain: {name:"일반 비",size:1,length:15,thickness:1.1,speed:350,density:1.65,alpha:.48,angle:.10,cloudReduction:.30,thunderChance:.045,lightningChance:.006},
  shower: {name:"소나기",size:1.3,length:25,thickness:1.65,speed:650,density:2.8,alpha:.58,angle:.14,cloudReduction:.53,thunderChance:.32,lightningChance:.11},
  storm: {name:"폭풍우",size:1.65,length:33,thickness:2.2,speed:900,density:4.2,alpha:.66,angle:.20,cloudReduction:.73,thunderChance:.68,lightningChance:.49},
};
export interface WeatherPlan {
  day: number; baseWeather: string; kind: RainKind | "none";
  startMinute: number; endMinute: number; fadeMinutes: number; seed: number;
  /** Degrees clockwise from east, speed in m/s; no gameplay force is applied. */
  windDirection: number; windSpeed: number; gustStrength: number;
}
export interface WeatherEvent {
  id: string; day: number; minute: number; seed: number;
  lightning: boolean; strength: number; thunderDelayMs: number;
}
export const WEATHER_EVENT_MINUTES = 80;
export const outdoors = (area: string): boolean =>
  !area.startsWith("mine") && !["farmhouse","general_store","cafe","workshop"].includes(area);
export function weatherRoll(seed: number, salt: number): number {
  let n = (seed ^ Math.imul(salt, 0x9e3779b1)) >>> 0;
  n = Math.imul(n ^ (n >>> 16), 0x21f0aaad);
  n = Math.imul(n ^ (n >>> 15), 0x735a2d97);
  return ((n ^ (n >>> 15)) >>> 0) / 4294967296;
}
export function makeWeatherPlan(seed: number, day: number, baseWeather: string, force?: RainKind): WeatherPlan {
  const key = (seed ^ Math.imul(day, 7919)) >>> 0, roll = weatherRoll(key,1);
  const kind = baseWeather !== "rain" ? "none" : force ?? (roll < .23 ? "drizzle" : roll < .68 ? "rain" : roll < .88 ? "shower" : "storm");
  const start = kind === "shower" ? 720 + Math.floor(weatherRoll(key,2)*240) : 0;
  return {day,baseWeather,kind,startMinute:start,endMinute:kind === "shower" ? start+160+Math.floor(weatherRoll(key,3)*100) : 1440,
    fadeMinutes:12,seed:key,windDirection:weatherRoll(key,4)*360,
    windSpeed:kind==="storm"?8:kind==="shower"?4:kind==="rain"?2: .6,
    gustStrength:kind==="storm"?.8:kind==="shower"?.45:.12};
}
export function ensureWeatherPlan(w: World): WeatherPlan {
  if (!w.weatherPlan || w.weatherPlan.day !== w.day) {
    // Legacy rainy snapshots retain all-day rain on their current day.
    w.weatherPlan = makeWeatherPlan(w.seed,w.day,w.weather,w.weather === "rain" ? "rain" : undefined);
  }
  return w.weatherPlan;
}
const smooth = (x: number) => { const t=Math.max(0,Math.min(1,x));return t*t*(3-2*t); };
export function rainIntensity(plan: WeatherPlan, minute: number): number {
  if(plan.kind === "none" || minute < plan.startMinute || minute >= plan.endMinute)return 0;
  return smooth((minute-plan.startMinute)/plan.fadeMinutes)*smooth((plan.endMinute-minute)/plan.fadeMinutes);
}
export function coarseWeather(plan: WeatherPlan, minute: number): string {
  if(plan.kind === "none")return plan.baseWeather;
  return minute >= plan.startMinute && minute < plan.endMinute ? "rain" : "clear";
}
export function rainWaters(w: World, area: string): boolean {
  return outdoors(area) && (w.weatherPlan?.day === w.day ? coarseWeather(w.weatherPlan,w.minute) : w.weather) === "rain";
}
/** At most once per rain period; callers commit through the existing world lease.
 * Rain stopping never dries soil. The established next-morning rule still does. */
export function applyWeatherAt(w: World, minute = w.minute): boolean {
  const plan=ensureWeatherPlan(w), weather=coarseWeather(plan,minute);
  let changed=w.weather!==weather;w.weather=weather;
  const period=`${w.day}:${plan.startMinute}`;
  if(weather === "rain" && w.rainWateredPeriod !== period) {
    for(const e of Object.values(w.entities))
      if((e.kind === "soil" || e.kind === "crop") && outdoors(e.area))e.watered=true;
    w.rainWateredPeriod=period;changed=true;
  }
  return changed;
}
export function weatherEventAt(plan: WeatherPlan, minute: number): WeatherEvent | undefined {
  if(plan.kind === "none")return;
  const slot=Math.floor(minute/WEATHER_EVENT_MINUTES), at=slot*WEATHER_EVENT_MINUTES;
  if(rainIntensity(plan,at)<.2)return;
  const profile=RAIN[plan.kind], roll=weatherRoll(plan.seed,100+slot);
  if(roll>=profile.thunderChance)return;
  const lightning=roll<profile.lightningChance;
  return {id:`${plan.day}:${slot}`,day:plan.day,minute:at,seed:Math.floor(weatherRoll(plan.seed,200+slot)*2147483647),
    lightning,strength:.45+weatherRoll(plan.seed,300+slot)*.4,
    thunderDelayMs:lightning?450+Math.floor(weatherRoll(plan.seed,400+slot)*650):0};
}
