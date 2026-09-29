import type { PlaceableDefinition, PlaceableId } from "./types";

export const PLACEABLE_DEFINITIONS: Record<PlaceableId, PlaceableDefinition> = {
  wood_processor: { id: "wood_processor", name: "목재 가공기", assetId: "wood_processor", itemId: "wood_processor", footprint: { width: 1, height: 1 }, collision: true, maps: ["farm"], interaction: "machine" },
};
export const isPlaceableId = (value: unknown): value is PlaceableId => typeof value === "string" && Object.hasOwn(PLACEABLE_DEFINITIONS, value);
