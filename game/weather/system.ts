import type { FarmTileData } from "../domain";
import { calendarDate } from "../world/calendar";
import { WEATHER_DEFINITIONS } from "./definitions";
import type { WeatherDefinition } from "./types";

/** Stable across devices and reconnects; a Family room id identifies its shared world. */
export function weatherFor(worldId: string, daySerial: number): WeatherDefinition {
  calendarDate(daySerial);
  let hash = 2166136261;
  for (const character of `jiwoos-farm:weather:v1:${worldId}:${daySerial}`) {
    hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  }
  const definitions = Object.values(WEATHER_DEFINITIONS);
  const total = definitions.reduce((sum, weather) => sum + weather.weight, 0);
  let roll = (hash >>> 0) % total;
  for (const weather of definitions) {
    if (roll < weather.weight) return weather;
    roll -= weather.weight;
  }
  throw new Error("No weather definitions");
}

/** Applied after yesterday's growth and reset; newly planted seeds on rainy days use the same rule. */
export function waterFarmForRain(farm: Iterable<FarmTileData>, weather: WeatherDefinition): void {
  if (weather.id !== "rain") return;
  for (const tile of farm) if (tile.tilled) tile.wateredToday = true;
}
