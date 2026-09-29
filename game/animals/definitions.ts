import type { AnimalDefinition, AnimalSpeciesId } from "./types";

export const ANIMAL_DEFINITIONS: Record<AnimalSpeciesId, AnimalDefinition> = {
  chicken: {
    id: "chicken", name: "닭", assetId: "chicken", homeBuildingTypes: ["chicken_coop"],
    produceItemId: "egg", productionDays: 1, purchasePrice: 120, produceSellPrice: 30,
    friendshipMax: 1000, petFriendship: 10, growthDays: 0, qualityTiers: ["normal"],
  },
};
export const isAnimalSpeciesId = (value: unknown): value is AnimalSpeciesId =>
  typeof value === "string" && Object.hasOwn(ANIMAL_DEFINITIONS, value);
