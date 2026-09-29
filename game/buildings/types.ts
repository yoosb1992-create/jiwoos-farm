import type { ItemId } from "../data/items";
import type { MapId, PixelRect } from "../maps/types";
import type { WorldObjectAssetId } from "../assets/definitions";

export type BuildingId = "work_shed" | "chicken_coop";
export interface BuildingDefinition {
  id: BuildingId; name: string; footprint: { width: number; height: number }; assetId: WorldObjectAssetId;
  maps: readonly MapId[]; cost: { money: number; materials: readonly { itemId: ItemId; quantity: number }[] };
  collision: PixelRect; entrance?: { x: number; y: number; interiorMapId?: MapId };
  constructionDays: number; animalCapacity?: number; allowedAnimalSpecies?: readonly import("../animals/types").AnimalSpeciesId[];
}
export interface BuildingInstance {
  id: string; definitionId: BuildingId; mapId: MapId; tileX: number; tileY: number;
  status: "constructing" | "ready"; startedDaySerial: number; readyDaySerial: number; upgradeLevel: number;
}
export interface BuildingsData { instances: BuildingInstance[] }
