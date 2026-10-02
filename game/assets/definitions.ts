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
  /** Decoded PNG size when a repeating texture is larger than one logical tile. */
  textureSize?: { width: number; height: number };
  displayScale: { x: number; y: number };
  origin: { x: number; y: number };
  /** Optional authored bounds for visual composition only. Never used for physics. */
  visualFootprint?: { width: number; height: number };
  /** Normalized point inside the displayed frame where the sprite touches the ground. */
  groundAnchor?: { x: number; y: number };
  /** Optional visual shadow placement. Never expands collision or interaction areas. */
  shadow?: { anchor: { x: number; y: number }; width: number; height: number; alpha: number };
}

export const displayedSize = (asset: VisualAssetDefinition) => ({
  width: asset.frameSize.width * asset.displayScale.x,
  height: asset.frameSize.height * asset.displayScale.y,
});

export const visualFootprint = (asset: VisualAssetDefinition) => asset.visualFootprint ?? displayedSize(asset);

export const groundAnchorPoint = (
  position: { x: number; y: number },
  asset: VisualAssetDefinition,
  displaySize = displayedSize(asset),
) => {
  const anchor = asset.groundAnchor ?? asset.origin;
  return {
    x: position.x - displaySize.width * asset.origin.x + displaySize.width * anchor.x,
    y: position.y - displaySize.height * asset.origin.y + displaySize.height * anchor.y,
  };
};

/** Shared y-sort contract for oversized objects and actors. Ground/terrain
 * layers stay below this range; UI/labels stay above WORLD_OVERLAY_DEPTH. */
export const WORLD_Y_SORT_BASE = 10;
export const WORLD_OVERLAY_DEPTH = 30;
export const depthFromWorldY = (worldY: number, layerBase = WORLD_Y_SORT_BASE) =>
  layerBase + worldY / 10_000;
export const depthFromGroundAnchor = (
  position: { x: number; y: number },
  asset: VisualAssetDefinition,
  displaySize = displayedSize(asset),
  layerBase = WORLD_Y_SORT_BASE,
) => depthFromWorldY(groundAnchorPoint(position, asset, displaySize).y, layerBase);

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

export type CharacterLifeStage = "child" | "teen" | "adult";
export interface CharacterVisualProfile {
  id: string;
  lifeStage: CharacterLifeStage;
  /** Life stage and appearance parts stay independent from the chosen sheet. */
  spriteProfileId: string;
  bodyProfileId: string;
  hairProfileId: string;
  outfitProfileId: string;
  accessoryProfileId?: string;
  asset: VisualAssetDefinition & {
    collisionBox: { width: number; height: number; offsetX: number; offsetY: number };
    animations: Record<PlayerAnimationName, PlayerAnimationDefinition>;
    fallback: { skin: number; hair: number; shirt: number; shadow: number };
  };
  /** Authored frame-space point used for lower-body interaction targeting. */
  interactionAnchor: { x: number; y: number };
  portraitSource?: Extract<AssetSource, { kind: "image" }>;
}

export const playerAnimationName = (state: PlayerAnimationState, facing: Facing) =>
  `${state}_${facing}` as PlayerAnimationName;

export const playerAnimationFrames = (definition: PlayerAnimationDefinition) =>
  Array.from({ length: definition.endFrame - definition.startFrame + 1 }, (_, index) => definition.startFrame + index);

export const PLAYER_ANIMATION_NAMES = [
  "idle_down", "idle_up", "idle_left", "idle_right",
  "walk_down", "walk_up", "walk_left", "walk_right",
  "tool_down", "tool_up", "tool_left", "tool_right",
] as const satisfies readonly PlayerAnimationName[];

const PLAYER_ANIMATIONS = {
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
} satisfies Record<PlayerAnimationName, PlayerAnimationDefinition>;

const characterProfile = (lifeStage: CharacterLifeStage, textureKey: string): CharacterVisualProfile => ({
  id: `${lifeStage}-default`, lifeStage, spriteProfileId: `${lifeStage}-default`,
  bodyProfileId: "body-default", hairProfileId: "hair-default", outfitProfileId: "outfit-default",
  interactionAnchor: { x: 16, y: 23.3 },
  asset: {
    assetId: lifeStage === "adult" ? "player_default" : `player_${lifeStage}_default`,
    textureKey,
    source: { kind: "spritesheet", path: "/assets/player/player-main.png", frameWidth: 32, frameHeight: 36 } as AssetSource,
    frameSize: { width: 32, height: 36 },
    displayScale: { x: 1, y: 1 },
    origin: { x: 0.5, y: 0.5 },
    visualFootprint: { width: 32, height: 36 },
    groundAnchor: { x: 0.5, y: 31 / 36 },
    shadow: { anchor: { x: 0.5, y: 31 / 36 }, width: 22, height: 8, alpha: 0.24 },
    collisionBox: { width: 18, height: 22, offsetX: 7, offsetY: 9 },
    animations: { ...PLAYER_ANIMATIONS },
    fallback: { skin: 0xf2c49b, hair: 0x3c3029, shirt: 0x5a87c9, shadow: 0x3a6d3a },
  },
});

const adultCharacterProfile = (): CharacterVisualProfile => {
  const legacy = characterProfile("adult", "player-default");
  return {
    ...legacy,
    spriteProfileId: "adult-farmer-v1",
    interactionAnchor: { x: 24, y: 62.3 },
    asset: {
      ...legacy.asset,
      source: { kind: "spritesheet", path: "/assets/graphics-vertical-slice/player/adult-farmer-48.png", frameWidth: 48, frameHeight: 72 },
      frameSize: { width: 48, height: 72 },
      displayScale: { x: 1, y: 1 },
      origin: { x: 0.5, y: 57 / 72 },
      visualFootprint: { width: 48, height: 72 },
      groundAnchor: { x: 0.5, y: 70 / 72 },
      shadow: { anchor: { x: 0.5, y: 70 / 72 }, width: 22, height: 8, alpha: 0.24 },
      collisionBox: { width: 18, height: 22, offsetX: 15, offsetY: 48 },
    },
  };
};

/** Child and teen intentionally use the proven current sheet until their own PNGs
 * arrive. Each profile is independently replaceable without a save migration. */
export const CHARACTER_VISUAL_PROFILES = {
  child: characterProfile("child", "player-child-default"),
  teen: characterProfile("teen", "player-teen-default"),
  adult: adultCharacterProfile(),
} as const satisfies Record<CharacterLifeStage, CharacterVisualProfile>;

export const DEFAULT_CHARACTER_LIFE_STAGE: CharacterLifeStage = "adult";
export const DEFAULT_CHARACTER_VISUAL_PROFILE = CHARACTER_VISUAL_PROFILES[DEFAULT_CHARACTER_LIFE_STAGE];
export const resolveCharacterVisualProfile = (lifeStage: string | null | undefined): CharacterVisualProfile =>
  lifeStage && Object.hasOwn(CHARACTER_VISUAL_PROFILES, lifeStage)
    ? CHARACTER_VISUAL_PROFILES[lifeStage as CharacterLifeStage]
    : DEFAULT_CHARACTER_VISUAL_PROFILE;

/** Backwards-compatible alias used by current gameplay, Family and forest code. */
export const PLAYER_ASSET = DEFAULT_CHARACTER_VISUAL_PROFILE.asset;

const tileAsset = (
  assetId: string,
  textureKey: string,
  fallback: { color: number; alpha?: number; stroke?: number },
  source: AssetSource = null,
  textureSize = { width: GAME_CONFIG.tileSize, height: GAME_CONFIG.tileSize },
) => ({
  assetId, textureKey, source, frameSize: { width: GAME_CONFIG.tileSize, height: GAME_CONFIG.tileSize },
  textureSize, displayScale: { x: 1, y: 1 }, origin: { x: 0.5, y: 0.5 }, fallback,
});
export const TILE_ASSETS = {
  tile_grass: tileAsset("tile_grass", "tile-grass", { color: 0x83b85e }, { kind: "image", path: "/assets/graphics-composition/tiles/grass.png" }, { width: 128, height: 128 }),
  tile_path: tileAsset("tile_path", "tile-path", { color: 0xc9aa71 }, { kind: "image", path: "/assets/graphics-first-pass/tiles/path.png" }, { width: 128, height: 128 }),
  tile_water: tileAsset("tile_water", "tile-water", { color: 0x66a8ca }, { kind: "image", path: "/assets/graphics-first-pass/tiles/water.png" }, { width: 128, height: 128 }),
  tile_farm_empty: tileAsset("tile_farm_empty", "farm-empty", { color: 0xb78a55, alpha: 0.28, stroke: 0x6e8f4a }, { kind: "image", path: "/assets/graphics-first-pass/tiles/farm-empty.png" }),
  tile_farm_tilled: tileAsset("tile_farm_tilled", "farm-tilled", { color: 0x896044, stroke: 0x68442f }, { kind: "image", path: "/assets/graphics-first-pass/tiles/farm-tilled.png" }),
  tile_farm_watered: tileAsset("tile_farm_watered", "farm-watered", { color: 0x5e493b, stroke: 0x68442f }, { kind: "image", path: "/assets/graphics-first-pass/tiles/farm-watered.png" }),
  tile_wood_floor: tileAsset("tile_wood_floor", "tile-wood-floor", { color: 0xb77b4c, stroke: 0x8f5d3b }, { kind: "image", path: "/assets/tiles/wood-floor.png" }),
  tile_stone_floor: tileAsset("tile_stone_floor", "tile-stone-floor", { color: 0xc8bd9f, stroke: 0xa89b7d }, { kind: "image", path: "/assets/tiles/stone-floor.png" }),
  tile_mine_floor: tileAsset("tile_mine_floor", "tile-mine-floor", { color: 0x56565d }, { kind: "image", path: "/assets/tiles/mine-floor.png" }),
  tile_mine_wall: tileAsset("tile_mine_wall", "tile-mine-wall", { color: 0x303138 }, { kind: "image", path: "/assets/tiles/mine-wall.png" }),
} as const;
export type TileAssetId = keyof typeof TILE_ASSETS;

/** Assets that may be placed as map objects: buildings, foliage, furniture, and decorations. */
const verticalSliceObject = (
  assetId: string,
  textureKey: string,
  filename: string,
  frameSize: { width: number; height: number },
  options: {
    origin?: { x: number; y: number };
    groundAnchor?: { x: number; y: number };
    shadow?: { anchor: { x: number; y: number }; width: number; height: number; alpha: number };
    defaultCollisionBox?: { x: number; y: number; width: number; height: number };
  } = {},
) => {
  const origin = options.origin ?? { x: 0.5, y: 0.94 };
  const groundAnchor = options.groundAnchor ?? origin;
  return {
    assetId,
    textureKey,
    source: { kind: "image" as const, path: `/assets/graphics-vertical-slice/objects/${filename}.png` },
    frameSize,
    displayScale: { x: 1, y: 1 },
    origin,
    visualFootprint: frameSize,
    groundAnchor,
    shadow: options.shadow ?? { anchor: groundAnchor, width: Math.min(frameSize.width * 0.68, 72), height: 9, alpha: 0.16 },
    ...(options.defaultCollisionBox ? { defaultCollisionBox: options.defaultCollisionBox } : {}),
    fallback: { fill: 0xa87543, stroke: 0x513b2b },
  };
};

export const WORLD_OBJECT_ASSETS = {
  house: { assetId: "house", textureKey: "building-house", source: { kind: "image", path: "/assets/graphics-first-pass/objects/farm-house.png" }, frameSize: { width: 224, height: 192 }, displayScale: { x: 1, y: 1 }, origin: { x: 0.5, y: 0.5 }, visualFootprint: { width: 224, height: 192 }, groundAnchor: { x: 0.5, y: 0.96 }, shadow: { anchor: { x: 0.5, y: 0.96 }, width: 168, height: 30, alpha: 0.2 }, defaultCollisionBox: { x: -96, y: -80, width: 192, height: 135 }, fallback: { wall: 0xe7bb72, roof: 0xb94e43, trim: 0x8b5c3a, door: 0x6f402d } },
  tree: { assetId: "tree", textureKey: "world-tree", source: { kind: "image", path: "/assets/graphics-first-pass/objects/tree.png" }, frameSize: { width: 128, height: 160 }, displayScale: { x: 1, y: 1 }, origin: { x: 0.5, y: 0.92 }, visualFootprint: { width: 128, height: 160 }, groundAnchor: { x: 0.5, y: 0.92 }, shadow: { anchor: { x: 0.5, y: 0.92 }, width: 42, height: 13, alpha: 0.18 }, defaultCollisionBox: { x: -11, y: -9, width: 22, height: 18 }, fallback: { trunk: 0x765033, crown: 0x356c42, highlight: 0x43814c } },
  forest_rock: { assetId: "forest_rock", textureKey: "forest-rock", source: { kind: "image", path: "/assets/objects/forest-rock.png" }, frameSize: { width: 32, height: 32 }, displayScale: { x: 1, y: 1 }, origin: { x: 0.5, y: 0.5 }, fallback: { fill: 0x929586, stroke: 0x515d58 } },
  forest_ore: { assetId: "forest_ore", textureKey: "forest-ore", source: { kind: "image", path: "/assets/objects/forest-ore.png" }, frameSize: { width: 32, height: 32 }, displayScale: { x: 1, y: 1 }, origin: { x: 0.5, y: 0.5 }, fallback: { fill: 0x69747e, stroke: 0x38434a } },
  mine_stone: { assetId: "mine_stone", textureKey: "mine-stone", source: { kind: "image", path: "/assets/objects/mine-stone.png" }, frameSize: { width: 32, height: 32 }, displayScale: { x: 1, y: 1 }, origin: { x: 0.5, y: 0.5 }, fallback: { fill: 0x898992, stroke: 0x3c3c49 } },
  mine_copper: { assetId: "mine_copper", textureKey: "mine-copper", source: { kind: "image", path: "/assets/objects/mine-copper.png" }, frameSize: { width: 32, height: 32 }, displayScale: { x: 1, y: 1 }, origin: { x: 0.5, y: 0.5 }, fallback: { fill: 0xb4774d, stroke: 0x654632 } },
  mine_ladder: { assetId: "mine_ladder", textureKey: "mine-ladder", source: { kind: "image", path: "/assets/objects/mine-ladder.png" }, frameSize: { width: 32, height: 32 }, displayScale: { x: 1, y: 1 }, origin: { x: 0.5, y: 0.5 }, fallback: { fill: 0x866043, stroke: 0x4b3024 } },
  mine_entrance: { assetId: "mine_entrance", textureKey: "mine-entrance", source: { kind: "image", path: "/assets/objects/mine-entrance.png" }, frameSize: { width: 48, height: 48 }, displayScale: { x: 1, y: 1 }, origin: { x: 0.5, y: 0.5 }, fallback: { fill: 0x4c4b52, stroke: 0x282830 } },
  forest_herb: { assetId: "forest_herb", textureKey: "forest-herb", source: { kind: "image", path: "/assets/objects/forest-herb.png" }, frameSize: { width: 32, height: 32 }, displayScale: { x: 1, y: 1 }, origin: { x: 0.5, y: 0.5 }, fallback: { stem: 0x426d42, leaf: 0x80ad60 } },
  forest_moon_mushroom: { assetId: "forest_moon_mushroom", textureKey: "forest-moon-mushroom", source: { kind: "image", path: "/assets/objects/forest-moon-mushroom.png" }, frameSize: { width: 32, height: 32 }, displayScale: { x: 1, y: 1 }, origin: { x: 0.5, y: 0.5 }, fallback: { stem: 0x9ed4ce, cap: 0x665f9d } },
  forest_fairy_bloom: { assetId: "forest_fairy_bloom", textureKey: "forest-fairy-bloom", source: { kind: "image", path: "/assets/objects/forest-fairy-bloom.png" }, frameSize: { width: 32, height: 32 }, displayScale: { x: 1, y: 1 }, origin: { x: 0.5, y: 0.5 }, fallback: { stem: 0x4a824b, petal: 0xf3b9d7 } },
  sell_basket: { assetId: "sell_basket", textureKey: "building-sell-basket", source: { kind: "image", path: "/assets/objects/sell-basket.png" }, frameSize: { width: 90, height: 76 }, displayScale: { x: 1, y: 1 }, origin: { x: 0.5, y: 0.5 }, groundAnchor: { x: 0.5, y: 0.9 }, fallback: { fill: 0x9e543b, stroke: 0x673a2a } },
  store: { assetId: "store", textureKey: "building-store", source: { kind: "image", path: "/assets/objects/store.png" }, frameSize: { width: 192, height: 160 }, displayScale: { x: 1, y: 1 }, origin: { x: 0.5, y: 0.5 }, groundAnchor: { x: 0.5, y: 0.94 }, fallback: { wall: 0xe8c47d, roof: 0x558060, trim: 0x7d5136, door: 0x704934 } },
  bed: { assetId: "bed", textureKey: "furniture-bed", source: { kind: "image", path: "/assets/objects/bed.png" }, frameSize: { width: 96, height: 56 }, displayScale: { x: 1, y: 1 }, origin: { x: 0.5, y: 0.5 }, fallback: { fill: 0xefd99d, stroke: 0x8f6047 } },
  crafting_table: { assetId: "crafting_table", textureKey: "furniture-crafting-table", source: { kind: "image", path: "/assets/objects/crafting-table.png" }, frameSize: { width: 64, height: 48 }, displayScale: { x: 1, y: 1 }, origin: { x: 0.5, y: 0.5 }, fallback: { fill: 0xae7951, stroke: 0x694635 } },
  storage_chest: { assetId: "storage_chest", textureKey: "furniture-storage-chest", source: { kind: "image", path: "/assets/objects/storage-chest.png" }, frameSize: { width: 64, height: 48 }, displayScale: { x: 1, y: 1 }, origin: { x: 0.5, y: 0.5 }, fallback: { fill: 0xb77843, stroke: 0x38261f } },
  wood_processor: { assetId: "wood_processor", textureKey: "world-wood-processor", source: { kind: "image", path: "/assets/objects/wood-processor.png" }, frameSize: { width: 40, height: 42 }, displayScale: { x: 1, y: 1 }, origin: { x: 0.5, y: 0.5 }, groundAnchor: { x: 0.5, y: 0.9 }, fallback: { fill: 0xa87543, stroke: 0x41352b } },
  work_shed: { assetId: "work_shed", textureKey: "building-work-shed", source: { kind: "image", path: "/assets/objects/work-shed.png" }, frameSize: { width: 96, height: 96 }, displayScale: { x: 1, y: 1 }, origin: { x: 0.5, y: 0.5 }, groundAnchor: { x: 0.5, y: 0.94 }, fallback: { fill: 0xc99459, stroke: 0x543d2a } },
  chicken_coop: { assetId: "chicken_coop", textureKey: "building-chicken-coop", source: { kind: "image", path: "/assets/objects/chicken-coop.png" }, frameSize: { width: 128, height: 96 }, displayScale: { x: 1, y: 1 }, origin: { x: 0.5, y: 0.5 }, groundAnchor: { x: 0.5, y: 0.94 }, fallback: { fill: 0xd5a25f, stroke: 0x593b28 } },
  chicken: { assetId: "chicken", textureKey: "animal-chicken", source: { kind: "image", path: "/assets/objects/chicken.png" }, frameSize: { width: 32, height: 32 }, displayScale: { x: 1, y: 1 }, origin: { x: 0.5, y: 0.5 }, groundAnchor: { x: 0.5, y: 0.82 }, fallback: { fill: 0xf3ead4, stroke: 0x7c5140 } },
  feed_trough: { assetId: "feed_trough", textureKey: "animal-feed-trough", source: { kind: "image", path: "/assets/objects/feed-trough.png" }, frameSize: { width: 40, height: 24 }, displayScale: { x: 1, y: 1 }, origin: { x: 0.5, y: 0.5 }, groundAnchor: { x: 0.5, y: 0.82 }, fallback: { fill: 0x9c7042, stroke: 0x503522 } },
  shop_counter: { assetId: "shop_counter", textureKey: "furniture-shop-counter", source: { kind: "image", path: "/assets/objects/shop-counter.png" }, frameSize: { width: 224, height: 56 }, displayScale: { x: 1, y: 1 }, origin: { x: 0.5, y: 0.5 }, groundAnchor: { x: 0.5, y: 0.86 }, fallback: { fill: 0x9c6543, stroke: 0x60402f } },
  fence_horizontal: verticalSliceObject("fence_horizontal", "farm-fence-horizontal", "fence-horizontal", { width: 128, height: 64 }, { defaultCollisionBox: { x: -60, y: -12, width: 120, height: 20 } }),
  fence_vertical: verticalSliceObject("fence_vertical", "farm-fence-vertical", "fence-vertical", { width: 64, height: 80 }, { defaultCollisionBox: { x: -10, y: -48, width: 20, height: 56 } }),
  fence_corner: verticalSliceObject("fence_corner", "farm-fence-corner", "fence-corner", { width: 96, height: 80 }, { defaultCollisionBox: { x: -34, y: -18, width: 68, height: 28 } }),
  gate: verticalSliceObject("gate", "farm-gate", "gate", { width: 128, height: 72 }),
  flowering_bush: verticalSliceObject("flowering_bush", "farm-flowering-bush", "flowering-bush", { width: 96, height: 64 }),
  green_shrub: verticalSliceObject("green_shrub", "farm-green-shrub", "green-shrub", { width: 88, height: 60 }),
  flower_bed: verticalSliceObject("flower_bed", "farm-flower-bed", "flower-bed", { width: 104, height: 56 }),
  mailbox: verticalSliceObject("mailbox", "farm-mailbox", "mailbox", { width: 56, height: 80 }),
  bench: verticalSliceObject("bench", "farm-bench", "bench", { width: 112, height: 72 }),
  rustic_lamp: verticalSliceObject("rustic_lamp", "farm-rustic-lamp", "rustic-lamp", { width: 64, height: 96 }),
  stone_well: verticalSliceObject("stone_well", "farm-stone-well", "stone-well", { width: 112, height: 104 }, { defaultCollisionBox: { x: -36, y: -18, width: 72, height: 28 } }),
  tree_variant_a: verticalSliceObject("tree_variant_a", "farm-tree-variant-a", "tree-variant-a", { width: 128, height: 160 }, { origin: { x: 0.5, y: 0.92 }, defaultCollisionBox: { x: -11, y: -9, width: 22, height: 18 } }),
  tree_variant_b: verticalSliceObject("tree_variant_b", "farm-tree-variant-b", "tree-variant-b", { width: 128, height: 160 }, { origin: { x: 0.5, y: 0.92 }, defaultCollisionBox: { x: -11, y: -9, width: 22, height: 18 } }),
  pond_rock_large: verticalSliceObject("pond_rock_large", "farm-pond-rock-large", "pond-rock-large", { width: 112, height: 88 }),
  stump: verticalSliceObject("stump", "farm-stump", "stump", { width: 80, height: 72 }),
  farm_crate: verticalSliceObject("farm_crate", "farm-crate", "farm-crate", { width: 72, height: 68 }),
} as const;
export type WorldObjectAssetId = keyof typeof WORLD_OBJECT_ASSETS;

const cropAsset = (assetId: string, textureKey: string, size: number, fruit: number, source: AssetSource = null) => ({
  assetId, textureKey, source, frameSize: { width: 29, height: 29 }, displayScale: { x: 1, y: 1 },
  origin: { x: 0.5, y: 0.5 }, fallback: { size, leaf: 0x416f36, fruit },
});
export const CROP_ASSETS = {
  crop_sproutberry_seed: cropAsset("crop_sproutberry_seed", "crop-sproutberry-0", 3, 0xb9d35b, { kind: "image", path: "/assets/graphics-first-pass/crops/sproutberry-seed.png" }),
  crop_sproutberry_sprout: cropAsset("crop_sproutberry_sprout", "crop-sproutberry-1", 6, 0x78b64b, { kind: "image", path: "/assets/graphics-first-pass/crops/sproutberry-sprout.png" }),
  crop_sproutberry_growing: cropAsset("crop_sproutberry_growing", "crop-sproutberry-2", 9, 0x3f8b45, { kind: "image", path: "/assets/graphics-first-pass/crops/sproutberry-growing.png" }),
  crop_sproutberry_mature: cropAsset("crop_sproutberry_mature", "crop-sproutberry-3", 12, 0xe88942, { kind: "image", path: "/assets/graphics-first-pass/crops/sproutberry-mature.png" }),
  crop_sunpotato_seed: cropAsset("crop_sunpotato_seed", "crop-sunpotato-seed", 3, 0xe6b443, { kind: "image", path: "/assets/crops/sunpotato-seed.png" }),
  crop_sunpotato_sprout: cropAsset("crop_sunpotato_sprout", "crop-sunpotato-sprout", 6, 0xe6b443, { kind: "image", path: "/assets/crops/sunpotato-sprout.png" }),
  crop_sunpotato_growing: cropAsset("crop_sunpotato_growing", "crop-sunpotato-growing", 9, 0xe6b443, { kind: "image", path: "/assets/crops/sunpotato-growing.png" }),
  crop_sunpotato_mature: cropAsset("crop_sunpotato_mature", "crop-sunpotato-mature", 12, 0xe6b443, { kind: "image", path: "/assets/crops/sunpotato-mature.png" }),
  crop_heartberry_seed: cropAsset("crop_heartberry_seed", "crop-heartberry-seed", 3, 0xe75c65, { kind: "image", path: "/assets/crops/heartberry-seed.png" }),
  crop_heartberry_sprout: cropAsset("crop_heartberry_sprout", "crop-heartberry-sprout", 6, 0xe75c65, { kind: "image", path: "/assets/crops/heartberry-sprout.png" }),
  crop_heartberry_growing: cropAsset("crop_heartberry_growing", "crop-heartberry-growing", 9, 0xe75c65, { kind: "image", path: "/assets/crops/heartberry-growing.png" }),
  crop_heartberry_mature: cropAsset("crop_heartberry_mature", "crop-heartberry-mature", 12, 0xe75c65, { kind: "image", path: "/assets/crops/heartberry-mature.png" }),
  crop_morningcarrot_seed: cropAsset("crop_morningcarrot_seed", "crop-morningcarrot-seed", 3, 0xf08b32, { kind: "image", path: "/assets/crops/morningcarrot-seed.png" }),
  crop_morningcarrot_sprout: cropAsset("crop_morningcarrot_sprout", "crop-morningcarrot-sprout", 6, 0xf08b32, { kind: "image", path: "/assets/crops/morningcarrot-sprout.png" }),
  crop_morningcarrot_growing: cropAsset("crop_morningcarrot_growing", "crop-morningcarrot-growing", 9, 0xf08b32, { kind: "image", path: "/assets/crops/morningcarrot-growing.png" }),
  crop_morningcarrot_mature: cropAsset("crop_morningcarrot_mature", "crop-morningcarrot-mature", 12, 0xf08b32, { kind: "image", path: "/assets/crops/morningcarrot-mature.png" }),
} as const;
export type CropAssetId = keyof typeof CROP_ASSETS;

export interface ItemAssetDefinition { assetId: string; textureKey: string; source: AssetSource; icon: string }
const itemAsset = (assetId: string, textureKey: string, icon: string, source: AssetSource = null): ItemAssetDefinition => ({ assetId, textureKey, source, icon });
export const ITEM_ASSETS = {
  item_hoe: itemAsset("item_hoe", "item-hoe", "⛏", { kind: "image", path: "/assets/items/hoe.png" }),
  item_seed: itemAsset("item_seed", "item-seed", "◉", { kind: "image", path: "/assets/items/seed.png" }),
  item_water: itemAsset("item_water", "item-water", "◒", { kind: "image", path: "/assets/items/water.png" }),
  item_hand: itemAsset("item_hand", "item-hand", "✋", { kind: "image", path: "/assets/items/hand.png" }),
  item_axe: itemAsset("item_axe", "item-axe", "🪓", { kind: "image", path: "/assets/items/axe.png" }),
  item_pickaxe: itemAsset("item_pickaxe", "item-pickaxe", "⛏", { kind: "image", path: "/assets/items/pickaxe.png" }),
  item_fishing_rod: itemAsset("item_fishing_rod", "item-fishing-rod", "🎣", { kind: "image", path: "/assets/items/fishing-rod.png" }),
  item_fish_minnow: itemAsset("item_fish_minnow", "item-fish-minnow", "🐟", { kind: "image", path: "/assets/items/fish-minnow.png" }),
  item_fish_crucian: itemAsset("item_fish_crucian", "item-fish-crucian", "🐟", { kind: "image", path: "/assets/items/fish-crucian.png" }),
  item_fish_carp: itemAsset("item_fish_carp", "item-fish-carp", "🐟", { kind: "image", path: "/assets/items/fish-carp.png" }),
  item_fish_catfish: itemAsset("item_fish_catfish", "item-fish-catfish", "🐟", { kind: "image", path: "/assets/items/fish-catfish.png" }),
  item_animal_feed: itemAsset("item_animal_feed", "item-animal-feed", "▧", { kind: "image", path: "/assets/items/animal-feed.png" }),
  item_stamina_biscuit: itemAsset("item_stamina_biscuit", "item-stamina-biscuit", "🍪"),
  item_egg: itemAsset("item_egg", "item-egg", "🥚", { kind: "image", path: "/assets/items/egg.png" }),
  item_wood: itemAsset("item_wood", "item-wood", "▰", { kind: "image", path: "/assets/items/wood.png" }),
  item_pine_needles: itemAsset("item_pine_needles", "item-pine-needles", "🌿"),
  item_pine_cone: itemAsset("item_pine_cone", "item-pine-cone", "🌰"),
  item_stone: itemAsset("item_stone", "item-stone", "◆", { kind: "image", path: "/assets/items/stone.png" }),
  item_copper_ore: itemAsset("item_copper_ore", "item-copper-ore", "◆", { kind: "image", path: "/assets/items/copper-ore.png" }),
  item_wild_herb: itemAsset("item_wild_herb", "item-wild-herb", "❧", { kind: "image", path: "/assets/items/wild-herb.png" }),
  item_moon_mushroom: itemAsset("item_moon_mushroom", "item-moon-mushroom", "☾", { kind: "image", path: "/assets/items/moon-mushroom.png" }),
  item_fairy_bloom: itemAsset("item_fairy_bloom", "item-fairy-bloom", "✿", { kind: "image", path: "/assets/items/fairy-bloom.png" }),
  item_wood_plank: itemAsset("item_wood_plank", "item-wood-plank", "▤", { kind: "image", path: "/assets/items/wood-plank.png" }),
  item_stone_block: itemAsset("item_stone_block", "item-stone-block", "▣", { kind: "image", path: "/assets/items/stone-block.png" }),
  item_fairy_thread: itemAsset("item_fairy_thread", "item-fairy-thread", "✧", { kind: "image", path: "/assets/items/fairy-thread.png" }),
  item_wood_processor: itemAsset("item_wood_processor", "item-wood-processor", "▣", { kind: "image", path: "/assets/items/wood-processor.png" }),
  item_sproutberry: itemAsset("item_sproutberry", "item-sproutberry", "●", { kind: "image", path: "/assets/items/sproutberry.png" }),
  item_sunpotato_seed: itemAsset("item_sunpotato_seed", "item-sunpotato_seed", "●", { kind: "image", path: "/assets/items/sunpotato_seed.png" }),
  item_sunpotato: itemAsset("item_sunpotato", "item-sunpotato", "●", { kind: "image", path: "/assets/items/sunpotato.png" }),
  item_heartberry_seed: itemAsset("item_heartberry_seed", "item-heartberry_seed", "♥", { kind: "image", path: "/assets/items/heartberry_seed.png" }),
  item_heartberry: itemAsset("item_heartberry", "item-heartberry", "♥", { kind: "image", path: "/assets/items/heartberry.png" }),
  item_morningcarrot_seed: itemAsset("item_morningcarrot_seed", "item-morningcarrot_seed", "◆", { kind: "image", path: "/assets/items/morningcarrot_seed.png" }),
  item_morningcarrot: itemAsset("item_morningcarrot", "item-morningcarrot", "◆", { kind: "image", path: "/assets/items/morningcarrot.png" }),
} as const;
