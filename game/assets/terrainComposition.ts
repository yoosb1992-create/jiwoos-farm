import type { VisualAssetDefinition } from "./definitions";

export type CardinalDirection = "north" | "east" | "south" | "west";
export type CornerDirection = "northWest" | "northEast" | "southEast" | "southWest";

const compositionAsset = (assetId: string, textureKey: string, path: string, size = 32): VisualAssetDefinition => ({
  assetId,
  textureKey,
  source: { kind: "image", path },
  frameSize: { width: size, height: size },
  displayScale: { x: 1, y: 1 },
  origin: { x: 0.5, y: 0.5 },
});

const root = "/assets/graphics-composition";

/** Optional visual overlays. They never participate in movement, collision,
 * farming, fishing, interaction or map serialization. */
export const TERRAIN_COMPOSITION_ASSETS = {
  path_edge_north: compositionAsset("path_edge_north", "path-edge-north", `${root}/tiles/path/edge-north.png`),
  path_edge_east: compositionAsset("path_edge_east", "path-edge-east", `${root}/tiles/path/edge-east.png`),
  path_edge_south: compositionAsset("path_edge_south", "path-edge-south", `${root}/tiles/path/edge-south.png`),
  path_edge_west: compositionAsset("path_edge_west", "path-edge-west", `${root}/tiles/path/edge-west.png`),
  path_outer_north_west: compositionAsset("path_outer_north_west", "path-outer-north-west", `${root}/tiles/path/outer-north-west.png`),
  path_outer_north_east: compositionAsset("path_outer_north_east", "path-outer-north-east", `${root}/tiles/path/outer-north-east.png`),
  path_outer_south_east: compositionAsset("path_outer_south_east", "path-outer-south-east", `${root}/tiles/path/outer-south-east.png`),
  path_outer_south_west: compositionAsset("path_outer_south_west", "path-outer-south-west", `${root}/tiles/path/outer-south-west.png`),
  path_inner_north_west: compositionAsset("path_inner_north_west", "path-inner-north-west", `${root}/tiles/path/inner-north-west.png`),
  path_inner_north_east: compositionAsset("path_inner_north_east", "path-inner-north-east", `${root}/tiles/path/inner-north-east.png`),
  path_inner_south_east: compositionAsset("path_inner_south_east", "path-inner-south-east", `${root}/tiles/path/inner-south-east.png`),
  path_inner_south_west: compositionAsset("path_inner_south_west", "path-inner-south-west", `${root}/tiles/path/inner-south-west.png`),

  water_edge_north: compositionAsset("water_edge_north", "water-edge-north", `${root}/tiles/water/edge-north.png`),
  water_edge_east: compositionAsset("water_edge_east", "water-edge-east", `${root}/tiles/water/edge-east.png`),
  water_edge_south: compositionAsset("water_edge_south", "water-edge-south", `${root}/tiles/water/edge-south.png`),
  water_edge_west: compositionAsset("water_edge_west", "water-edge-west", `${root}/tiles/water/edge-west.png`),
  water_corner_north_west: compositionAsset("water_corner_north_west", "water-corner-north-west", `${root}/tiles/water/corner-north-west.png`),
  water_corner_north_east: compositionAsset("water_corner_north_east", "water-corner-north-east", `${root}/tiles/water/corner-north-east.png`),
  water_corner_south_east: compositionAsset("water_corner_south_east", "water-corner-south-east", `${root}/tiles/water/corner-south-east.png`),
  water_corner_south_west: compositionAsset("water_corner_south_west", "water-corner-south-west", `${root}/tiles/water/corner-south-west.png`),

  farm_border_north: compositionAsset("farm_border_north", "farm-border-north", `${root}/tiles/farm/border-north.png`),
  farm_border_east: compositionAsset("farm_border_east", "farm-border-east", `${root}/tiles/farm/border-east.png`),
  farm_border_south: compositionAsset("farm_border_south", "farm-border-south", `${root}/tiles/farm/border-south.png`),
  farm_border_west: compositionAsset("farm_border_west", "farm-border-west", `${root}/tiles/farm/border-west.png`),
  farm_corner_north_west: compositionAsset("farm_corner_north_west", "farm-corner-north-west", `${root}/tiles/farm/corner-north-west.png`),
  farm_corner_north_east: compositionAsset("farm_corner_north_east", "farm-corner-north-east", `${root}/tiles/farm/corner-north-east.png`),
  farm_corner_south_east: compositionAsset("farm_corner_south_east", "farm-corner-south-east", `${root}/tiles/farm/corner-south-east.png`),
  farm_corner_south_west: compositionAsset("farm_corner_south_west", "farm-corner-south-west", `${root}/tiles/farm/corner-south-west.png`),

  decor_white_flowers: compositionAsset("decor_white_flowers", "decor-white-flowers", `${root}/decorations/white-flowers.png`),
  decor_color_flowers: compositionAsset("decor_color_flowers", "decor-color-flowers", `${root}/decorations/color-flowers.png`),
  decor_short_grass: compositionAsset("decor_short_grass", "decor-short-grass", `${root}/decorations/short-grass.png`),
  decor_long_grass: compositionAsset("decor_long_grass", "decor-long-grass", `${root}/decorations/long-grass.png`),
  decor_small_rock: compositionAsset("decor_small_rock", "decor-small-rock", `${root}/decorations/small-rock.png`),
  decor_twig: compositionAsset("decor_twig", "decor-twig", `${root}/decorations/twig.png`),
  decor_reeds: compositionAsset("decor_reeds", "decor-reeds", `${root}/decorations/reeds.png`, 40),
  decor_lily_pads: compositionAsset("decor_lily_pads", "decor-lily-pads", `${root}/decorations/lily-pads.png`, 40),
  decor_pond_rocks: compositionAsset("decor_pond_rocks", "decor-pond-rocks", `${root}/decorations/pond-rocks.png`, 40),
} as const;

export type TerrainCompositionAssetId = keyof typeof TERRAIN_COMPOSITION_ASSETS;

export interface TerrainDecorationPlacement {
  assetId: TerrainCompositionAssetId;
  tileX: number;
  tileY: number;
  depth?: number;
  alpha?: number;
  flipX?: boolean;
}

/** Sparse, authored placements keep important paths, farmable tiles, warps and
 * interactions clear. This is visual composition data, not a random system. */
export const FARM_TERRAIN_DECORATIONS: readonly TerrainDecorationPlacement[] = [
  { assetId: "decor_white_flowers", tileX: 2.6, tileY: 15.1 },
  { assetId: "decor_color_flowers", tileX: 37.2, tileY: 14.4 },
  { assetId: "decor_short_grass", tileX: 2.8, tileY: 6.7, alpha: 0.9 },
  { assetId: "decor_short_grass", tileX: 36.2, tileY: 20.9, alpha: 0.84, flipX: true },
  { assetId: "decor_long_grass", tileX: 23.2, tileY: 17.1 },
  { assetId: "decor_long_grass", tileX: 31.1, tileY: 18.7, flipX: true },
  { assetId: "decor_small_rock", tileX: 22.5, tileY: 20.8 },
  { assetId: "decor_twig", tileX: 35.1, tileY: 22.1, alpha: 0.88 },
  { assetId: "decor_reeds", tileX: 23.7, tileY: 16.4 },
  { assetId: "decor_reeds", tileX: 30.6, tileY: 19.4, flipX: true },
  { assetId: "decor_lily_pads", tileX: 27.3, tileY: 17.4, depth: 2.2 },
  { assetId: "decor_pond_rocks", tileX: 30.8, tileY: 15.4 },
] as const;
