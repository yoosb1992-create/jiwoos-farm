import { CROP_ASSETS, DEFAULT_CHARACTER_VISUAL_PROFILE, TILE_ASSETS, WORLD_OBJECT_ASSETS } from "./definitions";
import type { CardinalDirection, CornerDirection, TerrainCompositionAssetId } from "./terrainComposition";

/** The first deliberately small replacement boundary for Graphics Foundation 1.0.
 * Entries point at today's proven assets, so an unmade replacement keeps working. */
export const GRAPHICS_FOUNDATION_ASSET_SET = {
  grass: { kind: "tile", asset: TILE_ASSETS.tile_grass },
  path: { kind: "tile", asset: TILE_ASSETS.tile_path },
  water: { kind: "tile", asset: TILE_ASSETS.tile_water },
  farmEmpty: { kind: "tile", asset: TILE_ASSETS.tile_farm_empty },
  farmTilled: { kind: "tile", asset: TILE_ASSETS.tile_farm_tilled },
  farmWatered: { kind: "tile", asset: TILE_ASSETS.tile_farm_watered },
  tree: { kind: "world-object", asset: WORLD_OBJECT_ASSETS.tree },
  farmHouse: { kind: "world-object", asset: WORLD_OBJECT_ASSETS.house },
  player: { kind: "character", profile: DEFAULT_CHARACTER_VISUAL_PROFILE },
  springCrop: {
    kind: "crop",
    cropId: "sproutberry",
    stages: [
      CROP_ASSETS.crop_sproutberry_seed,
      CROP_ASSETS.crop_sproutberry_sprout,
      CROP_ASSETS.crop_sproutberry_growing,
      CROP_ASSETS.crop_sproutberry_mature,
    ],
  },
} as const;

/** Quiet base terrain and optional decoration are separate authoring concerns.
 * The decoration layer is intentionally data-only until placement rules are built. */
export const TERRAIN_GRAPHICS_PROFILE = {
  grass: {
    baseAssetId: "tile_grass",
    decorationLayer: "terrain-decoration",
    decorationAssetIds: ["decor_white_flowers", "decor_color_flowers", "decor_short_grass", "decor_long_grass", "decor_small_rock", "decor_twig"] as TerrainCompositionAssetId[],
  },
  path: {
    centerAssetId: "tile_path",
    edgeAssetIds: {
      north: "path_edge_north", east: "path_edge_east", south: "path_edge_south", west: "path_edge_west",
    } satisfies Record<CardinalDirection, TerrainCompositionAssetId>,
    outerCornerAssetIds: {
      northWest: "path_outer_north_west", northEast: "path_outer_north_east", southEast: "path_outer_south_east", southWest: "path_outer_south_west",
    } satisfies Record<CornerDirection, TerrainCompositionAssetId>,
    innerCornerAssetIds: {
      northWest: "path_inner_north_west", northEast: "path_inner_north_east", southEast: "path_inner_south_east", southWest: "path_inner_south_west",
    } satisfies Record<CornerDirection, TerrainCompositionAssetId>,
  },
  farm: {
    borderAssetIds: {
      north: "farm_border_north", east: "farm_border_east", south: "farm_border_south", west: "farm_border_west",
    } satisfies Record<CardinalDirection, TerrainCompositionAssetId>,
    cornerAssetIds: {
      northWest: "farm_corner_north_west", northEast: "farm_corner_north_east", southEast: "farm_corner_south_east", southWest: "farm_corner_south_west",
    } satisfies Record<CornerDirection, TerrainCompositionAssetId>,
  },
  water: {
    centerAssetId: "tile_water",
    edgeAssetIds: {
      north: "water_edge_north", east: "water_edge_east", south: "water_edge_south", west: "water_edge_west",
    } satisfies Record<CardinalDirection, TerrainCompositionAssetId>,
    cornerAssetIds: {
      northWest: "water_corner_north_west", northEast: "water_corner_north_east", southEast: "water_corner_south_east", southWest: "water_corner_south_west",
    } satisfies Record<CornerDirection, TerrainCompositionAssetId>,
    bankAssetIds: ["water_edge_north", "water_edge_east", "water_edge_south", "water_edge_west"] as TerrainCompositionAssetId[],
    decorationAssetIds: ["decor_reeds", "decor_lily_pads", "decor_pond_rocks"] as TerrainCompositionAssetId[],
  },
} as const;

export type GraphicsFoundationAssetRole = keyof typeof GRAPHICS_FOUNDATION_ASSET_SET;
