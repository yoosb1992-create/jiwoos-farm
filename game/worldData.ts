import { GAME_CONFIG } from "./config";
import type { BuildingAssetId, TileAssetId } from "./assets/definitions";

export type TileTypeId = "grass" | "path" | "water" | "farm";
export const TILE_TYPE_DEFINITIONS: Record<TileTypeId, { id: TileTypeId; walkable: boolean; farmable: boolean; graphicAssetId: TileAssetId }> = {
  grass: { id: "grass", walkable: true, farmable: false, graphicAssetId: "tile_grass" },
  path: { id: "path", walkable: true, farmable: false, graphicAssetId: "tile_path" },
  water: { id: "water", walkable: false, farmable: false, graphicAssetId: "tile_water" },
  farm: { id: "farm", walkable: true, farmable: true, graphicAssetId: "tile_farm_empty" },
};

export interface TileRegion { tileType: TileTypeId; startX: number; endX: number; startY: number; endY: number; depth: number }
export type WorldAction = "sleep" | "sell" | null;
export interface WorldObjectDefinition {
  id: string;
  assetId: BuildingAssetId | TileAssetId;
  position: { tileX: number; tileY: number };
  size: { width: number; height: number };
  collision: { enabled: boolean; width: number; height: number; offsetX: number; offsetY: number };
  interaction: { action: WorldAction; tileX: number; tileY: number; radius: number } | null;
  depth: number;
}

export const WORLD_MAP = {
  tileSize: GAME_CONFIG.tileSize,
  width: 42,
  height: 26,
  playerSpawn: { tileX: 7, tileY: 8 },
  farmArea: { startX: 9, endX: 18, startY: 8, endY: 14 },
  terrainRegions: [
    { tileType: "path", startX: 3, endX: 37, startY: 10, endY: 12, depth: 1 },
    { tileType: "water", startX: 24, endX: 30, startY: 15, endY: 20, depth: 1 },
  ] satisfies TileRegion[],
  objects: [
    {
      id: "house", assetId: "house", position: { tileX: 5, tileY: 5 }, size: { width: 192, height: 176 }, depth: 4,
      collision: { enabled: true, width: 192, height: 160, offsetX: 0, offsetY: 0 },
      interaction: { action: "sleep", tileX: 5, tileY: 8, radius: 125 },
    },
    {
      id: "sell_basket", assetId: "sell_basket", position: { tileX: 33, tileY: 7.5 }, size: { width: 90, height: 76 }, depth: 3,
      collision: { enabled: true, width: 90, height: 76, offsetX: 0, offsetY: 0 }, interaction: { action: "sell", tileX: 33, tileY: 7.5, radius: 100 },
    },
    {
      id: "pond", assetId: "tile_water", position: { tileX: 27.5, tileY: 18 }, size: { width: 224, height: 192 }, depth: 1,
      collision: { enabled: true, width: 224, height: 192, offsetX: 0, offsetY: 0 }, interaction: null,
    },
  ] satisfies WorldObjectDefinition[],
  boundary: { assetId: "tree" as BuildingAssetId, collision: { width: 28, height: 28 }, spriteOffset: 18 },
} as const;

export const worldPoint = (tileX: number, tileY: number) => ({ x: tileX * WORLD_MAP.tileSize, y: tileY * WORLD_MAP.tileSize });
export const getWorldObject = (id: string) => WORLD_MAP.objects.find((object) => object.id === id);
export const getTileTypeAt = (x: number, y: number): TileTypeId => {
  const farm = WORLD_MAP.farmArea;
  if (x >= farm.startX && x <= farm.endX && y >= farm.startY && y <= farm.endY) return "farm";
  const region = WORLD_MAP.terrainRegions.find((entry) => x >= entry.startX && x <= entry.endX && y >= entry.startY && y <= entry.endY);
  return region?.tileType ?? "grass";
};
