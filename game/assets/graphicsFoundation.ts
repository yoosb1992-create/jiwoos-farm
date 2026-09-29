import { CROP_ASSETS, DEFAULT_CHARACTER_VISUAL_PROFILE, TILE_ASSETS, WORLD_OBJECT_ASSETS } from "./definitions";

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
    decorationAssetIds: [] as string[],
  },
  water: {
    centerAssetId: "tile_water",
    edgeAssetIds: {} as Partial<Record<"north" | "east" | "south" | "west", string>>,
    cornerAssetIds: {} as Partial<Record<"northWest" | "northEast" | "southEast" | "southWest", string>>,
    bankAssetIds: [] as string[],
    decorationAssetIds: [] as string[], // reeds, lily pads and rocks
  },
} as const;

export type GraphicsFoundationAssetRole = keyof typeof GRAPHICS_FOUNDATION_ASSET_SET;
