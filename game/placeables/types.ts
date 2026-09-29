import type { Facing } from "../assets/definitions";
import type { ItemId } from "../data/items";
import type { MapId } from "../maps/types";
import type { MachineState } from "../machines/types";

export type PlaceableId = "wood_processor";
export interface PlaceableDefinition {
  id: PlaceableId; name: string; assetId: import("../assets/definitions").WorldObjectAssetId;
  itemId: ItemId; footprint: { width: number; height: number }; collision: boolean;
  maps: readonly MapId[]; interaction: "machine";
}
export interface PlaceableInstance {
  id: string; definitionId: PlaceableId; mapId: MapId; tileX: number; tileY: number;
  facing: Facing; state: { machine: MachineState };
}
export interface PlaceablesData { instances: PlaceableInstance[] }
