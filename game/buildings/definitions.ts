import type { BuildingDefinition, BuildingId } from "./types";

export const BUILDING_DEFINITIONS: Record<BuildingId, BuildingDefinition> = {
  work_shed: {
    id: "work_shed", name: "작업 창고", footprint: { width: 3, height: 3 }, assetId: "work_shed", maps: ["farm"],
    cost: { money: 100, materials: [{ itemId: "wood_plank", quantity: 2 }, { itemId: "stone_block", quantity: 1 }] },
    collision: { x: 0, y: 0, width: 96, height: 96 }, entrance: { x: 1, y: 3 }, constructionDays: 0,
  },
};
export const isBuildingId = (id: unknown): id is BuildingId => typeof id === "string" && Object.hasOwn(BUILDING_DEFINITIONS, id);
