import { GAME_CONFIG } from "../config";
import type { MapDefinition, MapId, MapObjectDefinition, TileRect, TileTypeId } from "./types";

export const TILE_TYPE_DEFINITIONS: Record<TileTypeId, { walkable: boolean; farmable: boolean; graphicAssetId: "tile_grass" | "tile_path" | "tile_water" | "tile_farm_empty" | "tile_wood_floor" | "tile_stone_floor" | "tile_mine_floor" | "tile_mine_wall" }> = {
  grass: { walkable: true, farmable: false, graphicAssetId: "tile_grass" },
  path: { walkable: true, farmable: false, graphicAssetId: "tile_path" },
  water: { walkable: false, farmable: false, graphicAssetId: "tile_water" },
  farm: { walkable: true, farmable: true, graphicAssetId: "tile_farm_empty" },
  wood_floor: { walkable: true, farmable: false, graphicAssetId: "tile_wood_floor" },
  stone_floor: { walkable: true, farmable: false, graphicAssetId: "tile_stone_floor" },
  mine_floor: { walkable: true, farmable: false, graphicAssetId: "tile_mine_floor" },
  mine_wall: { walkable: false, farmable: false, graphicAssetId: "tile_mine_wall" },
};

const area = (startX: number, endX: number, startY: number, endY: number): TileRect => ({ startX, endX, startY, endY });
const farmTree = (id: string, tileX: number, tileY: number, assetId: "tree" | "tree_variant_a" | "tree_variant_b" = "tree"): MapObjectDefinition => ({
  id,
  assetId,
  position: { tileX, tileY },
  collision: { x: -11, y: -9, width: 22, height: 18 },
  depth: 3,
});
const farmDressing = (id: string, assetId: MapObjectDefinition["assetId"], tileX: number, tileY: number, depth = 3): MapObjectDefinition => ({
  id, assetId, position: { tileX, tileY }, depth,
});

export const MAP_DEFINITIONS: Record<string, MapDefinition> = {
  farm: {
    id: "farm", name: "지우네 농장", width: 52, height: 26, baseTileType: "grass",
    terrainRegions: [
      // Authored route: front yard -> field lane -> pond bank / south exit.
      { ...area(3, 8, 9, 11), tileType: "path", depth: 1 },
      { ...area(7, 8, 12, 16), tileType: "path", depth: 1 },
      { ...area(7, 22, 15, 16), tileType: "path", depth: 1 },
      { ...area(19, 22, 13, 25), tileType: "path", depth: 1 },
      { ...area(22, 28, 13, 14), tileType: "path", depth: 1 },
      { ...area(28, 31, 11, 13), tileType: "path", depth: 1 },
      { ...area(31, 35, 9, 11), tileType: "path", depth: 1 },
      { ...area(35, 46, 9, 10), tileType: "path", depth: 1 },
      { ...area(24, 30, 15, 20), tileType: "water", depth: 1 },
    ],
    farmAreas: [area(9, 18, 8, 14)], collisionRegions: [area(24, 30, 15, 20)],
    objects: [
      { id: "house", assetId: "house", position: { tileX: 5, tileY: 5 }, collision: { x: -96, y: -80, width: 192, height: 135 }, label: "집", depth: 4 },
      { id: "sell_basket", assetId: "sell_basket", position: { tileX: 33, tileY: 7.5 }, collision: { x: -45, y: -38, width: 90, height: 76 }, interaction: { action: "sell", area: area(31, 35, 6, 9) }, label: "판매 바구니", depth: 3 },
      // House yard: lived-in props frame, but never cover, the doorway route.
      farmDressing("yard_mailbox", "mailbox", 8.9, 7.2),
      farmDressing("yard_flower_bed", "flower_bed", 2.5, 8.2),
      farmDressing("yard_shrub", "green_shrub", 9.6, 6.7),
      farmDressing("yard_bench", "bench", 1.9, 11.5),
      farmDressing("yard_lamp", "rustic_lamp", 7.7, 8.7),
      { ...farmDressing("yard_well", "stone_well", 12.1, 5.3), collision: { x: -36, y: -18, width: 72, height: 28 } },
      { ...farmDressing("yard_fence_west", "fence_horizontal", 2.1, 12.7), collision: { x: -60, y: -12, width: 120, height: 20 } },

      // Field edge: short fence fragments and props soften the farm rectangle.
      { ...farmDressing("field_fence_north_west", "fence_horizontal", 10.8, 7.2), collision: { x: -60, y: -12, width: 120, height: 20 } },
      { ...farmDressing("field_fence_north_east", "fence_horizontal", 16.3, 7.2), collision: { x: -60, y: -12, width: 120, height: 20 } },
      { ...farmDressing("field_fence_west", "fence_vertical", 8.75, 11.5), collision: { x: -10, y: -48, width: 20, height: 56 } },
      farmDressing("field_fence_corner", "fence_corner", 8.2, 7.4),
      farmDressing("field_gate", "gate", 19.4, 12.5),
      farmDressing("field_crate", "farm_crate", 19.3, 8.0),

      // Pond and outer-edge dressing hide hard terrain corners without changing water collision.
      farmDressing("pond_large_rock", "pond_rock_large", 30.7, 20.5),
      farmDressing("pond_flowering_bush", "flowering_bush", 32.4, 20.7),
      farmDressing("pond_shrub", "green_shrub", 22.4, 18.8),
      // Curated starter clusters: cozy yard, pond rest spot, and lantern-marked south lane.
      farmDressing("yard_flower_bed_east", "flower_bed", 8.2, 5.8),
      farmDressing("yard_shrub_west", "flowering_bush", 1.8, 8.7),
      farmDressing("yard_lamp_south", "rustic_lamp", 4.0, 13.4),
      farmDressing("pond_bench", "bench", 22.5, 17.2),
      farmDressing("pond_lamp", "rustic_lamp", 23.0, 21.3),
      farmDressing("pond_flower_bed", "flower_bed", 32.0, 17.4),
      farmDressing("south_lamp_west", "rustic_lamp", 18.0, 22.2),
      farmDressing("south_lamp_east", "rustic_lamp", 23.1, 22.2),
      farmDressing("east_stump", "stump", 35.4, 4.9),

      // East meadow: give the widened half of the farm a destination without
      // blocking future build clearings or the main walking lane.
      { ...farmDressing("east_meadow_flower_bed", "flower_bed", 41.8, 6.7), collision: { x: -42, y: -8, width: 84, height: 14 } },
      { ...farmDressing("east_meadow_shrub_north", "flowering_bush", 44.5, 5.6), collision: { x: -28, y: -10, width: 56, height: 18 } },
      { ...farmDressing("east_meadow_lamp", "rustic_lamp", 41.0, 11.4), collision: { x: -8, y: -10, width: 16, height: 16 } },
      { ...farmDressing("east_meadow_bench", "bench", 44.4, 11.7), collision: { x: -48, y: -14, width: 96, height: 18 } },
      { ...farmDressing("east_meadow_shrub_south", "green_shrub", 47.0, 19.2), collision: { x: -26, y: -9, width: 52, height: 16 } },

      farmTree("farm_tree_house_west", 1.6, 5.2, "tree_variant_a"),
      farmTree("farm_tree_house_east", 10.4, 4.2, "tree_variant_b"),
      farmTree("farm_tree_north_1", 16.2, 2.8),
      farmTree("farm_tree_north_2", 22.4, 3.3, "tree_variant_a"),
      farmTree("farm_tree_north_3", 28.8, 2.7, "tree_variant_b"),
      farmTree("farm_tree_north_east", 39.3, 4.5),
      farmTree("farm_tree_west_mid", 1.8, 15.8, "tree_variant_b"),
      farmTree("farm_tree_west_south", 2.5, 22.8),
      farmTree("farm_tree_east_mid", 39.5, 12.7, "tree_variant_a"),
      farmTree("farm_tree_east_pond", 39.2, 19.3),
      farmTree("farm_tree_south_east", 37.2, 23.5, "tree_variant_b"),
      farmTree("farm_tree_south_pond", 30.8, 24.2, "tree_variant_a"),
      farmTree("farm_tree_far_east_north", 48.5, 4.0, "tree_variant_a"),
      farmTree("farm_tree_far_east_mid", 49.2, 13.0, "tree_variant_b"),
      farmTree("farm_tree_far_east_south", 47.8, 22.8),
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
    id: "farmhouse", name: "농장집", width: 22, height: 13, baseTileType: "wood_floor",
    terrainRegions: [{ ...area(0, 17, 0, 1), tileType: "stone_floor" }], farmAreas: [], collisionRegions: [],
    objects: [
      { id: "bed", assetId: "bed", position: { tileX: 7, tileY: 7 }, collision: { x: -48, y: -28, width: 96, height: 56 }, interaction: { action: "sleep", area: area(5, 9, 6, 9) }, label: "침대 · 잠자기", depth: 3 },
      { id: "crafting_table", assetId: "crafting_table", position: { tileX: 12, tileY: 6.5 }, collision: { x: -28, y: -12, width: 56, height: 28 }, interaction: { action: "craft", area: area(10, 14, 5, 8) }, label: "제작대", depth: 3 },
      { id: "family_chest", assetId: "storage_chest", position: { tileX: 3, tileY: 4 }, collision: { x: -25, y: -15, width: 50, height: 29 }, interaction: { action: "storage", area: area(1, 5, 3, 5), containerId: "family_chest" }, label: "가족 보관함", depth: 3 },
    ],
    spawns: [{ id: "entry", tileX: 9, tileY: 10, facing: "up" }, { id: "bed_wake", tileX: 9.5, tileY: 7, facing: "left" }],
    warps: [{ id: "exit", area: area(8, 10, 11, 12), targetMapId: "farm", targetSpawnId: "from_house" }],
    boundary: { enabled: true, openings: [area(8, 10, 11, 12)] },
  },
  road: {
    id: "road", name: "들꽃길", width: 30, height: 14, baseTileType: "grass",
    terrainRegions: [{ ...area(9, 12, 0, 13), tileType: "path" }, { ...area(1, 4, 4, 10), tileType: "water" }], farmAreas: [], collisionRegions: [area(1, 4, 4, 10)],
    objects: [],
    spawns: [{ id: "farm_entrance", tileX: 10.5, tileY: 3, facing: "down" }, { id: "town_entrance", tileX: 10.5, tileY: 10.5, facing: "up" }],
    warps: [{ id: "to_farm", area: area(9, 12, 0, 1), targetMapId: "farm", targetSpawnId: "from_road" }, { id: "to_town", area: area(9, 12, 12, 13), targetMapId: "town", targetSpawnId: "from_road" }],
    boundary: { enabled: true, openings: [area(9, 12, 0, 1), area(9, 12, 12, 13)] },
  },
  town: {
    id: "town", name: "햇살마을", width: 44, height: 18, baseTileType: "grass",
    terrainRegions: [{ ...area(14, 19, 0, 17), tileType: "path" }, { ...area(5, 28, 8, 12), tileType: "stone_floor" }], farmAreas: [], collisionRegions: [],
    objects: [{ id: "general_store", assetId: "store", position: { tileX: 24, tileY: 7 }, collision: { x: -96, y: -72, width: 192, height: 118 }, label: "새봄 상점", depth: 4 }],
    spawns: [{ id: "from_road", tileX: 16.5, tileY: 15.5, facing: "up" }, { id: "from_store", tileX: 24, tileY: 10.5, facing: "down" }],
    warps: [{ id: "to_road", area: area(14, 19, 16, 17), targetMapId: "road", targetSpawnId: "town_entrance" }, { id: "store_door", area: area(22, 26, 9, 10), targetMapId: "general_store", targetSpawnId: "entry" }],
    boundary: { enabled: true, openings: [area(14, 19, 16, 17)] },
  },
  general_store: {
    id: "general_store", name: "새봄 상점", width: 22, height: 13, baseTileType: "wood_floor",
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
export const getTileTypeInMap = (map: MapDefinition, x: number, y: number): TileTypeId => {
  if (map.farmAreas.some((rect) => x >= rect.startX && x <= rect.endX && y >= rect.startY && y <= rect.endY)) return "farm";
  return map.terrainRegions.findLast((r) => x >= r.startX && x <= r.endX && y >= r.startY && y <= r.endY)?.tileType ?? map.baseTileType;
};
export const getTileTypeAt = (mapId: MapId, x: number, y: number): TileTypeId => getTileTypeInMap(MAP_DEFINITIONS[mapId], x, y);
