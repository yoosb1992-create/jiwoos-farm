export type WeatherId = "clear" | "cloudy" | "rain";
export interface WeatherDefinition { id: WeatherId; name: string; icon: string; weight: number }
