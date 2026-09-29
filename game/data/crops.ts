import type { CropAssetId } from "../assets/definitions";
import type { ItemId } from "./items";

export interface CropStageDefinition {
  id: string;
  assetId: CropAssetId;
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

const springCrop = (id: string, name: string, growthDays: number, seedItemId: ItemId, harvestItemId: ItemId, sellPrice: number): CropDefinition => ({
  id, name, growthDays, seedItemId, harvestItemId, sellPrice,
  // One stage per watered day preserves SaveData v4 without adding a growth counter.
  stages: Array.from({ length: growthDays + 1 }, (_, day) => {
    const visual = day === 0 ? "seed" : day === growthDays ? "mature" : day <= Math.floor(growthDays / 2) ? "sprout" : "growing";
    return { id: `${visual}_${day}`, growthDay: day, assetId: `crop_${id}_${visual}` as CropAssetId };
  }),
});

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
  sunpotato: springCrop("sunpotato", "햇살감자", 4, "sunpotato_seed", "sunpotato", 60),
  heartberry: springCrop("heartberry", "하트딸기", 5, "heartberry_seed", "heartberry", 90),
  morningcarrot: springCrop("morningcarrot", "아침당근", 3, "morningcarrot_seed", "morningcarrot", 45),
} as const satisfies Record<string, CropDefinition>;

export type CropId = keyof typeof CROP_DEFINITIONS;
export const DEFAULT_CROP_ID: CropId = "sproutberry";

export const getCropDefinition = (cropId: CropId) => CROP_DEFINITIONS[cropId];
export const isMatureCrop = (cropId: CropId, stage: number) => stage >= getCropDefinition(cropId).stages.length - 1;

export const isCropId = (value: unknown): value is CropId => typeof value === "string" && Object.hasOwn(CROP_DEFINITIONS, value);
