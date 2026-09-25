import { GAME_CONFIG } from "../config";

export type AssetSource =
  | { kind: "image"; path: string }
  | { kind: "spritesheet"; path: string; frameWidth: number; frameHeight: number }
  | null;

export interface VisualAssetDefinition {
  assetId: string;
  textureKey: string;
  source: AssetSource;
  frameSize: { width: number; height: number };
  displayScale: { x: number; y: number };
  origin: { x: number; y: number };
}

export const displayedSize = (asset: VisualAssetDefinition) => ({
  width: asset.frameSize.width * asset.displayScale.x,
  height: asset.frameSize.height * asset.displayScale.y,
});

export const physicsBoxForScale = (
  box: { width: number; height: number; offsetX: number; offsetY: number },
  scale: { x: number; y: number },
) => ({
  width: box.width / Math.abs(scale.x), height: box.height / Math.abs(scale.y),
  offsetX: box.offsetX / Math.abs(scale.x), offsetY: box.offsetY / Math.abs(scale.y),
});

export const GAME_RENDER_SETTINGS = { backgroundColor: "#86b85d", pixelArt: true, roundPixels: true } as const;

export type Facing = "up" | "down" | "left" | "right";
export type PlayerAnimationName =
  | "idle_down" | "idle_up" | "idle_left" | "idle_right"
  | "walk_down" | "walk_up" | "walk_left" | "walk_right"
  | "tool_down" | "tool_up" | "tool_left" | "tool_right";

export type PlayerAnimationState = "idle" | "walk" | "tool";
export type PlayerAnimationDefinition = { startFrame: number; endFrame: number; fps: number; repeat: number };

export const playerAnimationName = (state: PlayerAnimationState, facing: Facing) =>
  `${state}_${facing}` as PlayerAnimationName;

export const playerAnimationFrames = (definition: PlayerAnimationDefinition) =>
  Array.from({ length: definition.endFrame - definition.startFrame + 1 }, (_, index) => definition.startFrame + index);

export const PLAYER_ANIMATION_NAMES = [
  "idle_down", "idle_up", "idle_left", "idle_right",
  "walk_down", "walk_up", "walk_left", "walk_right",
  "tool_down", "tool_up", "tool_left", "tool_right",
] as const satisfies readonly PlayerAnimationName[];

export const PLAYER_ASSET = {
  assetId: "player_default",
  textureKey: "player-default",
  source: { kind: "spritesheet", path: "/assets/player/player-main.png", frameWidth: 32, frameHeight: 36 } as AssetSource,
  frameSize: { width: 32, height: 36 },
  displayScale: { x: 1, y: 1 },
  origin: { x: 0.5, y: 0.5 },
  collisionBox: { width: 18, height: 22, offsetX: 7, offsetY: 9 },
  interactionPoints: {
    up: { x: 0, y: -34 }, down: { x: 0, y: 34 },
    left: { x: -34, y: 0 }, right: { x: 34, y: 0 },
  } satisfies Record<Facing, { x: number; y: number }>,
  animations: {
    idle_down: { startFrame: 0, endFrame: 3, fps: 1, repeat: -1 },
    idle_up: { startFrame: 4, endFrame: 7, fps: 1, repeat: -1 },
    idle_left: { startFrame: 8, endFrame: 11, fps: 1, repeat: -1 },
    idle_right: { startFrame: 12, endFrame: 15, fps: 1, repeat: -1 },
    walk_down: { startFrame: 16, endFrame: 19, fps: 8, repeat: -1 },
    walk_up: { startFrame: 20, endFrame: 23, fps: 8, repeat: -1 },
    walk_left: { startFrame: 24, endFrame: 27, fps: 8, repeat: -1 },
    walk_right: { startFrame: 28, endFrame: 31, fps: 8, repeat: -1 },
    tool_down: { startFrame: 32, endFrame: 35, fps: 10, repeat: 0 },
    tool_up: { startFrame: 36, endFrame: 39, fps: 10, repeat: 0 },
    tool_left: { startFrame: 40, endFrame: 43, fps: 10, repeat: 0 },
    tool_right: { startFrame: 44, endFrame: 47, fps: 10, repeat: 0 },
  } satisfies Record<PlayerAnimationName, PlayerAnimationDefinition>,
  fallback: { skin: 0xf2c49b, hair: 0x3c3029, shirt: 0x5a87c9, shadow: 0x3a6d3a },
} as const;

const tileAsset = (assetId: string, textureKey: string, fallback: { color: number; alpha?: number; stroke?: number }, source: AssetSource = null) => ({
  assetId, textureKey, source, frameSize: { width: GAME_CONFIG.tileSize, height: GAME_CONFIG.tileSize },
  displayScale: { x: 1, y: 1 }, origin: { x: 0.5, y: 0.5 }, fallback,
});
export const TILE_ASSETS = {
  tile_grass: tileAsset("tile_grass", "tile-grass", { color: 0x83b85e }),
  tile_path: tileAsset("tile_path", "tile-path", { color: 0xc9aa71 }),
  tile_water: tileAsset("tile_water", "tile-water", { color: 0x66a8ca }),
  tile_farm_empty: tileAsset("tile_farm_empty", "farm-empty", { color: 0xb78a55, alpha: 0.28, stroke: 0x6e8f4a }),
  tile_farm_tilled: tileAsset("tile_farm_tilled", "farm-tilled", { color: 0x896044, stroke: 0x68442f }),
  tile_farm_watered: tileAsset("tile_farm_watered", "farm-watered", { color: 0x5e493b, stroke: 0x68442f }),
  tile_wood_floor: tileAsset("tile_wood_floor", "tile-wood-floor", { color: 0xb77b4c, stroke: 0x8f5d3b }),
  tile_stone_floor: tileAsset("tile_stone_floor", "tile-stone-floor", { color: 0xc8bd9f, stroke: 0xa89b7d }),
} as const;
export type TileAssetId = keyof typeof TILE_ASSETS;

/** Assets that may be placed as map objects: buildings, foliage, furniture, and decorations. */
export const WORLD_OBJECT_ASSETS = {
  house: { assetId: "house", textureKey: "building-house", source: null, frameSize: { width: 192, height: 176 }, displayScale: { x: 1, y: 1 }, origin: { x: 0.5, y: 0.5 }, fallback: { wall: 0xe7bb72, roof: 0xb94e43, trim: 0x8b5c3a, door: 0x6f402d } },
  tree: { assetId: "tree", textureKey: "world-tree", source: null, frameSize: { width: 44, height: 56 }, displayScale: { x: 1, y: 1 }, origin: { x: 0.5, y: 0.5 }, fallback: { trunk: 0x765033, crown: 0x356c42, highlight: 0x43814c } },
  sell_basket: { assetId: "sell_basket", textureKey: "building-sell-basket", source: null, frameSize: { width: 90, height: 76 }, displayScale: { x: 1, y: 1 }, origin: { x: 0.5, y: 0.5 }, fallback: { fill: 0x9e543b, stroke: 0x673a2a } },
  store: { assetId: "store", textureKey: "building-store", source: null, frameSize: { width: 192, height: 160 }, displayScale: { x: 1, y: 1 }, origin: { x: 0.5, y: 0.5 }, fallback: { wall: 0xe8c47d, roof: 0x558060, trim: 0x7d5136, door: 0x704934 } },
  bed: { assetId: "bed", textureKey: "furniture-bed", source: null, frameSize: { width: 96, height: 56 }, displayScale: { x: 1, y: 1 }, origin: { x: 0.5, y: 0.5 }, fallback: { fill: 0xefd99d, stroke: 0x8f6047 } },
  shop_counter: { assetId: "shop_counter", textureKey: "furniture-shop-counter", source: null, frameSize: { width: 224, height: 56 }, displayScale: { x: 1, y: 1 }, origin: { x: 0.5, y: 0.5 }, fallback: { fill: 0x9c6543, stroke: 0x60402f } },
} as const;
export type WorldObjectAssetId = keyof typeof WORLD_OBJECT_ASSETS;

const cropAsset = (assetId: string, textureKey: string, size: number, fruit: number, source: AssetSource = null) => ({
  assetId, textureKey, source, frameSize: { width: 29, height: 29 }, displayScale: { x: 1, y: 1 },
  origin: { x: 0.5, y: 0.5 }, fallback: { size, leaf: 0x416f36, fruit },
});
export const CROP_ASSETS = {
  crop_sproutberry_seed: cropAsset("crop_sproutberry_seed", "crop-sproutberry-0", 3, 0xb9d35b),
  crop_sproutberry_sprout: cropAsset("crop_sproutberry_sprout", "crop-sproutberry-1", 6, 0x78b64b),
  crop_sproutberry_growing: cropAsset("crop_sproutberry_growing", "crop-sproutberry-2", 9, 0x3f8b45),
  crop_sproutberry_mature: cropAsset("crop_sproutberry_mature", "crop-sproutberry-3", 12, 0xe88942),
} as const;
export type CropAssetId = keyof typeof CROP_ASSETS;

export interface ItemAssetDefinition { assetId: string; textureKey: string; source: AssetSource; icon: string }
const itemAsset = (assetId: string, textureKey: string, icon: string, source: AssetSource = null): ItemAssetDefinition => ({ assetId, textureKey, source, icon });
export const ITEM_ASSETS = {
  item_hoe: itemAsset("item_hoe", "item-hoe", "⛏"),
  item_seed: itemAsset("item_seed", "item-seed", "◉"),
  item_water: itemAsset("item_water", "item-water", "◒"),
  item_hand: itemAsset("item_hand", "item-hand", "✋"),
  item_sproutberry: itemAsset("item_sproutberry", "item-sproutberry", "●"),
} as const;
