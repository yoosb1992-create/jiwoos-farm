import type { Facing } from "../assets/definitions";
import type { WorldObjectAssetId } from "../assets/definitions";

/** Map ids are data-owned so editor-created maps do not require a TypeScript change. */
export type MapId = string;
export type TileTypeId = "grass" | "path" | "water" | "farm" | "wood_floor" | "stone_floor";
export type MapAction = "sleep" | "open_shop" | "sell";

export interface TileRect { startX: number; endX: number; startY: number; endY: number }
export interface PixelRect { x: number; y: number; width: number; height: number }
export interface TileRegion extends TileRect { tileType: TileTypeId; depth?: number }
export interface SpawnDefinition { id: string; tileX: number; tileY: number; facing: Facing }
export interface WarpDefinition {
  id: string;
  area: TileRect;
  targetMapId: MapId;
  targetSpawnId: string;
}
export interface MapObjectDefinition {
  id: string;
  assetId: WorldObjectAssetId;
  position: { tileX: number; tileY: number };
  displaySizeOverride?: { width: number; height: number };
  collision?: PixelRect;
  interaction?: { action: MapAction; area: TileRect };
  label?: string;
  depth?: number;
}
export interface MapDefinition {
  id: MapId;
  name: string;
  width: number;
  height: number;
  baseTileType: TileTypeId;
  terrainRegions: TileRegion[];
  farmAreas: TileRect[];
  collisionRegions: TileRect[];
  objects: MapObjectDefinition[];
  spawns: SpawnDefinition[];
  warps: WarpDefinition[];
  boundary: { enabled: boolean; openings?: TileRect[] };
}
