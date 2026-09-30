import type { FishDefinition, FishId, FishingSpotDefinition, FishingSpotId } from "./types";

/** The north bank of the farm pond is dry grass, directly above its authored water tiles. */
export const FISHING_SPOTS: Record<FishingSpotId, FishingSpotDefinition> = {
  farm_pond: { id: "farm_pond", name: "농장 연못", mapId: "farm",
    waterArea: { startX: 24, endX: 30, startY: 15, endY: 20 },
    shoreArea: { startX: 25, endX: 28, startY: 14, endY: 14 }, facing: "down" },
};
export const FISH_DEFINITIONS: Record<FishId, FishDefinition> = {
  minnow: { id: "minnow", itemId: "fish_minnow", name: "송사리", seasons: ["spring", "summer", "autumn", "winter"], weather: ["clear", "cloudy", "rain"], startMinutes: 360, endMinutes: 1430, spots: ["farm_pond"], weight: 50, rarity: "common", sellPrice: 12 },
  crucian: { id: "crucian", itemId: "fish_crucian", name: "붕어", seasons: ["spring", "summer", "autumn"], weather: ["clear", "cloudy", "rain"], startMinutes: 360, endMinutes: 1080, spots: ["farm_pond"], weight: 30, rarity: "common", sellPrice: 25 },
  carp: { id: "carp", itemId: "fish_carp", name: "잉어", seasons: ["spring"], weather: ["clear", "cloudy"], startMinutes: 600, endMinutes: 1200, spots: ["farm_pond"], weight: 14, rarity: "uncommon", sellPrice: 42 },
  catfish: { id: "catfish", itemId: "fish_catfish", name: "메기", seasons: ["summer", "autumn"], weather: ["rain"], startMinutes: 1080, endMinutes: 1430, spots: ["farm_pond"], weight: 7, rarity: "rare", sellPrice: 75 },
};
export const FISH_BITE_DELAY_MINUTES = 4;
export const FISH_BITE_WINDOW_MINUTES = 60;
