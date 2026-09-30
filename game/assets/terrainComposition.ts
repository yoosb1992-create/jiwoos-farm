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

/** Authored placements compose a lived-in starting farm while keeping paths,
 * farmable tiles, warps and interaction anchors clear. They are deterministic
 * visual data only and never participate in gameplay or save serialization. */
export const FARM_TERRAIN_DECORATIONS: readonly TerrainDecorationPlacement[] = [
  // House yard: decorate the lawn edges, never the door or front-yard route.
  { assetId: "decor_white_flowers", tileX: 2.1, tileY: 8.3 },
  { assetId: "decor_color_flowers", tileX: 8.5, tileY: 6.7, flipX: true },
  { assetId: "decor_short_grass", tileX: 1.8, tileY: 11.8, alpha: 0.86 },
  { assetId: "decor_long_grass", tileX: 10.8, tileY: 6.3 },
  { assetId: "decor_small_rock", tileX: 9.3, tileY: 4.9 },
  { assetId: "decor_twig", tileX: 2.5, tileY: 12.9, alpha: 0.88 },

  // Field border: the 9..18,8..14 farmable rectangle itself stays unobscured.
  { assetId: "decor_white_flowers", tileX: 8.1, tileY: 8.1 },
  { assetId: "decor_color_flowers", tileX: 19.1, tileY: 7.3 },
  { assetId: "decor_short_grass", tileX: 7.8, tileY: 13.8, alpha: 0.9 },
  { assetId: "decor_long_grass", tileX: 19.2, tileY: 9.0, flipX: true },
  { assetId: "decor_small_rock", tileX: 13.4, tileY: 7.0 },
  { assetId: "decor_twig", tileX: 17.4, tileY: 17.0, alpha: 0.82 },

  // Pond: shore plants and stones frame the collision rectangle; lily pads sit on water.
  { assetId: "decor_reeds", tileX: 23.5, tileY: 15.5 },
  { assetId: "decor_reeds", tileX: 23.7, tileY: 20.5, flipX: true },
  { assetId: "decor_reeds", tileX: 30.7, tileY: 17.0, flipX: true },
  { assetId: "decor_reeds", tileX: 29.7, tileY: 20.6 },
  { assetId: "decor_lily_pads", tileX: 26.2, tileY: 17.1, depth: 2.2 },
  { assetId: "decor_lily_pads", tileX: 28.6, tileY: 18.6, depth: 2.2, flipX: true },
  { assetId: "decor_pond_rocks", tileX: 23.6, tileY: 20.4 },
  { assetId: "decor_pond_rocks", tileX: 30.6, tileY: 15.5, flipX: true },
  { assetId: "decor_pond_rocks", tileX: 30.7, tileY: 20.4 },
  { assetId: "decor_long_grass", tileX: 32.0, tileY: 16.2 },
  { assetId: "decor_short_grass", tileX: 32.1, tileY: 20.1, alpha: 0.88 },

  // South exit: decorations point toward the road but leave the 19..22 warp open.
  { assetId: "decor_white_flowers", tileX: 17.7, tileY: 23.0 },
  { assetId: "decor_color_flowers", tileX: 23.5, tileY: 22.8 },
  { assetId: "decor_short_grass", tileX: 17.5, tileY: 24.7, alpha: 0.86 },
  { assetId: "decor_long_grass", tileX: 23.7, tileY: 24.6, flipX: true },
  { assetId: "decor_small_rock", tileX: 17.8, tileY: 20.8 },
  { assetId: "decor_twig", tileX: 23.8, tileY: 21.7, alpha: 0.84 },

  // Outer boundary clusters imply a finite homestead without filling future clearings.
  { assetId: "decor_white_flowers", tileX: 4.6, tileY: 2.1 },
  { assetId: "decor_color_flowers", tileX: 34.2, tileY: 3.0 },
  { assetId: "decor_short_grass", tileX: 12.5, tileY: 2.0, alpha: 0.82 },
  { assetId: "decor_long_grass", tileX: 33.8, tileY: 23.8, flipX: true },
  { assetId: "decor_small_rock", tileX: 5.4, tileY: 23.7 },
  { assetId: "decor_twig", tileX: 35.0, tileY: 15.0, alpha: 0.82 },
  { assetId: "decor_white_flowers", tileX: 3.7, tileY: 18.2 },
  { assetId: "decor_color_flowers", tileX: 37.0, tileY: 8.8 },
  { assetId: "decor_short_grass", tileX: 6.2, tileY: 20.8, alpha: 0.84 },
  { assetId: "decor_long_grass", tileX: 36.5, tileY: 21.0 },
  { assetId: "decor_small_rock", tileX: 35.8, tileY: 6.5 },
  { assetId: "decor_twig", tileX: 14.8, tileY: 22.8, alpha: 0.8 },

  // Expanded east meadow: sparse clusters break up the wide lawn while the
  // centre line remains open for movement, buildings and later content.
  { assetId: "decor_white_flowers", tileX: 40.2, tileY: 2.3 },
  { assetId: "decor_color_flowers", tileX: 43.2, tileY: 3.4, flipX: true },
  { assetId: "decor_short_grass", tileX: 46.0, tileY: 2.8, alpha: 0.84 },
  { assetId: "decor_small_rock", tileX: 49.4, tileY: 5.1 },
  { assetId: "decor_long_grass", tileX: 40.4, tileY: 7.4, flipX: true },
  { assetId: "decor_color_flowers", tileX: 47.2, tileY: 7.8 },
  { assetId: "decor_short_grass", tileX: 48.6, tileY: 11.9, alpha: 0.86 },
  { assetId: "decor_twig", tileX: 41.3, tileY: 15.2, alpha: 0.82 },
  { assetId: "decor_long_grass", tileX: 44.0, tileY: 17.4 },
  { assetId: "decor_color_flowers", tileX: 49.0, tileY: 16.4, flipX: true },
  { assetId: "decor_white_flowers", tileX: 50.0, tileY: 20.2 },
  { assetId: "decor_small_rock", tileX: 44.8, tileY: 22.4 },
  { assetId: "decor_short_grass", tileX: 48.6, tileY: 23.5, alpha: 0.84 },
] as const;
