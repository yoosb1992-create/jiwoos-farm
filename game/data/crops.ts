import type { ItemId } from "./items";

export interface CropStageDefinition {
  id: string;
  assetId: string;
  growthDay: number;
}

export interface CropDefinition {
  id: string;
  name: string;
  growthDays: number;
  seedItemId: ItemId;
  harvestItemId: ItemId;
  sellPrice: number;
  stages: readonly CropStageDefinition[];
}

export const CROP_DEFINITIONS = {
  sproutberry: {
    id: "sproutberry",
    name: "새싹열매",
    growthDays: 3,
    seedItemId: "sproutberry_seed",
    harvestItemId: "sproutberry",
    sellPrice: 35,
    stages: [
      { id: "seed", growthDay: 0, assetId: "crop_sproutberry_seed" },
      { id: "sprout", growthDay: 1, assetId: "crop_sproutberry_sprout" },
      { id: "growing", growthDay: 2, assetId: "crop_sproutberry_growing" },
      { id: "mature", growthDay: 3, assetId: "crop_sproutberry_mature" },
    ],
  },
} as const satisfies Record<string, CropDefinition>;

export type CropId = keyof typeof CROP_DEFINITIONS;
export const DEFAULT_CROP_ID: CropId = "sproutberry";

export const getCropDefinition = (cropId: CropId) => CROP_DEFINITIONS[cropId];
export const isMatureCrop = (cropId: CropId, stage: number) => stage >= getCropDefinition(cropId).stages.length - 1;
