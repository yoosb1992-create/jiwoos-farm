import type { BuildingDefinition, BuildingId } from "./types";

export const BUILDING_DEFINITIONS: Record<BuildingId, BuildingDefinition> = {
  work_shed: {
    id: "work_shed", name: "작업 창고", footprint: { width: 3, height: 3 }, assetId: "work_shed", maps: ["farm"],
    cost: { money: 100, materials: [{ itemId: "wood_plank", quantity: 2 }, { itemId: "stone_block", quantity: 1 }] },
    collision: { x: 0, y: 0, width: 96, height: 96 }, entrance: { x: 1, y: 3 }, constructionDays: 0,
  },
  chicken_coop: {
    id: "chicken_coop", name: "닭장", footprint: { width: 4, height: 3 }, assetId: "chicken_coop", maps: ["farm"],
    cost: { money: 150, materials: [{ itemId: "wood_plank", quantity: 2 }, { itemId: "stone_block", quantity: 1 }] },
    collision: { x: 0, y: 0, width: 128, height: 96 },
    entrance: { x: 2, y: 3, interiorMapId: "chicken_coop_interior" }, constructionDays: 0,
    animalCapacity: 4, allowedAnimalSpecies: ["chicken"],
  },
};
export const isBuildingId = (id: unknown): id is BuildingId => typeof id === "string" && Object.hasOwn(BUILDING_DEFINITIONS, id);
