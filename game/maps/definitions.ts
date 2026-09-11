import { GAME_CONFIG } from "../config";
import type { MapDefinition, MapId, TileRect, TileTypeId } from "./types";

export const TILE_TYPE_DEFINITIONS: Record<TileTypeId, { walkable: boolean; farmable: boolean; graphicAssetId: "tile_grass" | "tile_path" | "tile_water" | "tile_farm_empty" | "tile_wood_floor" | "tile_stone_floor" }> = {
  grass: { walkable: true, farmable: false, graphicAssetId: "tile_grass" },
  path: { walkable: true, farmable: false, graphicAssetId: "tile_path" },
  water: { walkable: false, farmable: false, graphicAssetId: "tile_water" },
  farm: { walkable: true, farmable: true, graphicAssetId: "tile_farm_empty" },
  wood_floor: { walkable: true, farmable: false, graphicAssetId: "tile_wood_floor" },
  stone_floor: { walkable: true, farmable: false, graphicAssetId: "tile_stone_floor" },
};

const area = (startX: number, endX: number, startY: number, endY: number): TileRect => ({ startX, endX, startY, endY });

export const MAP_DEFINITIONS: Record<MapId, MapDefinition> = {
  farm: {
    id: "farm", name: "지우네 농장", width: 42, height: 26, baseTileType: "grass",
    terrainRegions: [
      { ...area(3, 37, 10, 12), tileType: "path", depth: 1 },
      { ...area(24, 30, 15, 20), tileType: "water", depth: 1 },
      { ...area(19, 22, 23, 25), tileType: "path", depth: 1 },
    ],
    farmAreas: [area(9, 18, 8, 14)], collisionRegions: [area(24, 30, 15, 20)],
    objects: [
      { id: "house", assetId: "house", position: { tileX: 5, tileY: 5 }, size: { width: 192, height: 176 }, collision: { x: -96, y: -80, width: 192, height: 135 }, label: "집", depth: 4 },
      { id: "sell_basket", assetId: "sell_basket", position: { tileX: 33, tileY: 7.5 }, collision: { x: -45, y: -38, width: 90, height: 76 }, interaction: { action: "sell", area: area(31, 35, 6, 9) }, label: "판매 바구니", depth: 3 },
    ],
    spawns: [
      { id: "house_front", tileX: 7, tileY: 8, facing: "down" },
      { id: "from_house", tileX: 5, tileY: 9.2, facing: "down" },
      { id: "from_road", tileX: 20.5, tileY: 22, facing: "up" },
    ],
    warps: [
      { id: "house_door", area: area(4, 6, 8, 9), targetMapId: "farmhouse", targetSpawnId: "entry" },
      { id: "exit_south", area: area(19, 22, 24, 25), targetMapId: "road", targetSpawnId: "farm_entrance" },
    ], boundary: { enabled: true, openings: [area(19, 22, 24, 25)] },
  },
  farmhouse: {
    id: "farmhouse", name: "농장집", width: 18, height: 13, baseTileType: "wood_floor",
    terrainRegions: [{ ...area(0, 17, 0, 1), tileType: "stone_floor" }], farmAreas: [], collisionRegions: [],
    objects: [
      { id: "bed", assetId: "bed", position: { tileX: 4, tileY: 4 }, collision: { x: -48, y: -28, width: 96, height: 56 }, interaction: { action: "sleep", area: area(2, 6, 3, 6) }, label: "침대 · 잠자기", depth: 3 },
    ],
    spawns: [{ id: "entry", tileX: 9, tileY: 10, facing: "up" }, { id: "bed_wake", tileX: 6.5, tileY: 5, facing: "left" }],
    warps: [{ id: "exit", area: area(8, 10, 11, 12), targetMapId: "farm", targetSpawnId: "from_house" }],
    boundary: { enabled: true, openings: [area(8, 10, 11, 12)] },
  },
  road: {
    id: "road", name: "들꽃길", width: 22, height: 26, baseTileType: "grass",
    terrainRegions: [{ ...area(9, 12, 0, 25), tileType: "path" }, { ...area(1, 4, 7, 18), tileType: "water" }], farmAreas: [], collisionRegions: [area(1, 4, 7, 18)],
    objects: [],
    spawns: [{ id: "farm_entrance", tileX: 10.5, tileY: 2, facing: "down" }, { id: "town_entrance", tileX: 10.5, tileY: 23, facing: "up" }],
    warps: [{ id: "to_farm", area: area(9, 12, 0, 1), targetMapId: "farm", targetSpawnId: "from_road" }, { id: "to_town", area: area(9, 12, 24, 25), targetMapId: "town", targetSpawnId: "from_road" }],
    boundary: { enabled: true, openings: [area(9, 12, 0, 1), area(9, 12, 24, 25)] },
  },
  town: {
    id: "town", name: "햇살마을", width: 34, height: 24, baseTileType: "grass",
    terrainRegions: [{ ...area(14, 19, 0, 23), tileType: "path" }, { ...area(5, 28, 10, 14), tileType: "stone_floor" }], farmAreas: [], collisionRegions: [],
    objects: [{ id: "general_store", assetId: "store", position: { tileX: 24, tileY: 7 }, collision: { x: -96, y: -72, width: 192, height: 118 }, label: "새봄 상점", depth: 4 }],
    spawns: [{ id: "from_road", tileX: 16.5, tileY: 21.5, facing: "up" }, { id: "from_store", tileX: 24, tileY: 10.5, facing: "down" }],
    warps: [{ id: "to_road", area: area(14, 19, 22, 23), targetMapId: "road", targetSpawnId: "town_entrance" }, { id: "store_door", area: area(22, 26, 9, 10), targetMapId: "general_store", targetSpawnId: "entry" }],
    boundary: { enabled: true, openings: [area(14, 19, 22, 23)] },
  },
  general_store: {
    id: "general_store", name: "새봄 상점", width: 18, height: 13, baseTileType: "wood_floor",
    terrainRegions: [{ ...area(0, 17, 0, 1), tileType: "stone_floor" }], farmAreas: [], collisionRegions: [],
    objects: [{ id: "shop_counter", assetId: "shop_counter", position: { tileX: 9, tileY: 4 }, collision: { x: -112, y: -28, width: 224, height: 56 }, interaction: { action: "open_shop", area: area(5, 12, 4, 7) }, label: "씨앗 구매", depth: 3 }],
    spawns: [{ id: "entry", tileX: 9, tileY: 10, facing: "up" }],
    warps: [{ id: "exit", area: area(8, 10, 11, 12), targetMapId: "town", targetSpawnId: "from_store" }],
    boundary: { enabled: true, openings: [area(8, 10, 11, 12)] },
  },
};

export const tileSize = GAME_CONFIG.tileSize;
export const tilePoint = (tileX: number, tileY: number) => ({ x: tileX * tileSize, y: tileY * tileSize });
export const pointInTileRect = (x: number, y: number, rect: TileRect) => {
  const tileX = x / tileSize, tileY = y / tileSize;
  return tileX >= rect.startX && tileX <= rect.endX + 1 && tileY >= rect.startY && tileY <= rect.endY + 1;
};
export const getTileTypeAt = (mapId: MapId, x: number, y: number): TileTypeId => {
  const map = MAP_DEFINITIONS[mapId];
  if (map.farmAreas.some((rect) => x >= rect.startX && x <= rect.endX && y >= rect.startY && y <= rect.endY)) return "farm";
  return map.terrainRegions.find((r) => x >= r.startX && x <= r.endX && y >= r.startY && y <= r.endY)?.tileType ?? map.baseTileType;
};
