import type { WeatherDefinition, WeatherId } from "./types";

export const WEATHER_DEFINITIONS: Record<WeatherId, WeatherDefinition> = {
  clear: { id: "clear", name: "맑음", icon: "☀", weight: 5 },
  cloudy: { id: "cloudy", name: "흐림", icon: "☁", weight: 3 },
  rain: { id: "rain", name: "비", icon: "☂", weight: 2 },
};
