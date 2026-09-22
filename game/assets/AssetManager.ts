import type * as Phaser from "phaser";
import { CROP_ASSETS, ITEM_ASSETS, PLAYER_ANIMATION_NAMES, PLAYER_ASSET, TILE_ASSETS, WORLD_OBJECT_ASSETS, displayedSize, playerAnimationFrames, type AssetSource } from "./definitions";

const loadSource = (scene: Phaser.Scene, key: string, source: AssetSource) => {
  if (!source) return;
  if (source.kind === "spritesheet") scene.load.spritesheet(key, source.path, { frameWidth: source.frameWidth, frameHeight: source.frameHeight });
  else scene.load.image(key, source.path);
};

export class AssetManager {
  private playerSpritesheetReady = false;

  constructor(private readonly scene: Phaser.Scene) {}

  preload() {
    loadSource(this.scene, PLAYER_ASSET.textureKey, PLAYER_ASSET.source);
    Object.values(TILE_ASSETS).forEach((asset) => loadSource(this.scene, asset.textureKey, asset.source));
    Object.values(WORLD_OBJECT_ASSETS).forEach((asset) => loadSource(this.scene, asset.textureKey, asset.source));
    Object.values(CROP_ASSETS).forEach((asset) => loadSource(this.scene, asset.textureKey, asset.source));
    Object.values(ITEM_ASSETS).forEach((asset) => loadSource(this.scene, asset.textureKey, asset.source));
  }

  createFallbackTextures() {
    this.playerSpritesheetReady = this.hasValidPlayerSpritesheet();
    if (!this.playerSpritesheetReady) {
      // A missing file and a sheet with too few frames are both recoverable. Remove
      // an incomplete texture before generating the known-safe single-frame fallback.
      if (PLAYER_ASSET.source?.kind === "spritesheet" && this.scene.textures.exists(PLAYER_ASSET.textureKey)) {
        this.scene.textures.remove(PLAYER_ASSET.textureKey);
      }
      if (!this.scene.textures.exists(PLAYER_ASSET.textureKey)) this.createPlayerFallback();
    }
    Object.values(TILE_ASSETS).forEach((asset) => {
      if (this.scene.textures.exists(asset.textureKey)) return;
      const size = displayedSize(asset);
      const graphics = this.scene.add.graphics();
      graphics.fillStyle(asset.fallback.color, "alpha" in asset.fallback ? asset.fallback.alpha ?? 1 : 1).fillRect(0, 0, size.width, size.height);
      if ("stroke" in asset.fallback) graphics.lineStyle(1, asset.fallback.stroke ?? 0, 0.7).strokeRect(0.5, 0.5, size.width - 1, size.height - 1);
      if (asset.textureKey === TILE_ASSETS.tile_farm_watered.textureKey) graphics.fillStyle(0x7caac0, 0.7).fillCircle(7, 7, 2);
      graphics.generateTexture(asset.textureKey, size.width, size.height).destroy();
    });
    this.createBuildingFallbacks();
    this.createCropFallbacks();
  }

  createPlayerAnimations() {
    for (const name of PLAYER_ANIMATION_NAMES) {
      const definition = PLAYER_ASSET.animations[name];
      // Phaser's animation manager is shared between scene restarts. Recreate these
      // stable keys so a previous fallback animation cannot mask a newly loaded sheet.
      if (this.scene.anims.exists(name)) this.scene.anims.remove(name);
      const frames = this.playerSpritesheetReady
        ? this.scene.anims.generateFrameNumbers(PLAYER_ASSET.textureKey, { start: definition.startFrame, end: definition.endFrame })
        : [{ key: PLAYER_ASSET.textureKey }];
      this.scene.anims.create({
        key: name,
        frames,
        frameRate: definition.fps,
        repeat: definition.repeat,
      });
    }
  }

  private hasValidPlayerSpritesheet() {
    if (PLAYER_ASSET.source?.kind !== "spritesheet" || !this.scene.textures.exists(PLAYER_ASSET.textureKey)) return false;
    const texture = this.scene.textures.get(PLAYER_ASSET.textureKey);
    return Object.values(PLAYER_ASSET.animations)
      .flatMap(playerAnimationFrames)
      .every((frame) => texture.has(String(frame)));
  }

  private createPlayerFallback() {
    const { frameSize, fallback } = PLAYER_ASSET;
    const graphics = this.scene.add.graphics();
    graphics.fillStyle(fallback.shadow).fillRoundedRect(4, 15, 24, 18, 5)
      .fillStyle(fallback.skin).fillCircle(16, 12, 9)
      .fillStyle(fallback.hair).fillRect(8, 5, 16, 5)
      .fillStyle(fallback.shirt).fillRect(8, 16, 16, 11)
      .generateTexture(PLAYER_ASSET.textureKey, frameSize.width, frameSize.height).destroy();
  }

  private createBuildingFallbacks() {
    const house = WORLD_OBJECT_ASSETS.house;
    if (!this.scene.textures.exists(house.textureKey)) {
      const g = this.scene.add.graphics(); const f = house.fallback;
      const { width, height } = displayedSize(house);
      g.fillStyle(f.wall).fillRect(0, 30, width, height - 30).lineStyle(8, f.trim).strokeRect(4, 34, width - 8, height - 38)
        .fillStyle(f.roof).fillTriangle(0, 55, width, 55, width / 2, 0).fillStyle(f.door).fillRect(width / 2 - 22, height - 80, 44, 60)
        .generateTexture(house.textureKey, width, height).destroy();
    }
    const tree = WORLD_OBJECT_ASSETS.tree;
    if (!this.scene.textures.exists(tree.textureKey)) {
      const g = this.scene.add.graphics(); const f = tree.fallback;
      g.fillStyle(f.trunk).fillRect(18, 29, 8, 22).fillStyle(f.crown).fillCircle(22, 17, 19)
        .fillStyle(f.highlight).fillCircle(13, 22, 11).generateTexture(tree.textureKey, displayedSize(tree).width, displayedSize(tree).height).destroy();
    }
    const basket = WORLD_OBJECT_ASSETS.sell_basket;
    if (!this.scene.textures.exists(basket.textureKey)) {
      const g = this.scene.add.graphics(); const f = basket.fallback;
      const { width, height } = displayedSize(basket);
      g.fillStyle(f.fill).fillRect(3, 3, width - 6, height - 6).lineStyle(6, f.stroke).strokeRect(3, 3, width - 6, height - 6)
        .generateTexture(basket.textureKey, width, height).destroy();
    }
    const store = WORLD_OBJECT_ASSETS.store;
    if (!this.scene.textures.exists(store.textureKey)) {
      const g = this.scene.add.graphics(); const f = store.fallback; const { width, height } = displayedSize(store);
      g.fillStyle(f.wall).fillRect(0, 28, width, height - 28).fillStyle(f.roof).fillTriangle(0, 50, width, 50, width / 2, 0)
        .lineStyle(6, f.trim).strokeRect(4, 48, width - 8, height - 52).fillStyle(f.door).fillRect(width / 2 - 18, height - 54, 36, 54)
        .generateTexture(store.textureKey, width, height).destroy();
    }
    for (const asset of [WORLD_OBJECT_ASSETS.bed, WORLD_OBJECT_ASSETS.shop_counter]) {
      if (this.scene.textures.exists(asset.textureKey)) continue;
      const g = this.scene.add.graphics(); const f = asset.fallback; const { width, height } = displayedSize(asset);
      g.fillStyle(f.fill).fillRoundedRect(2, 2, width - 4, height - 4, 7).lineStyle(4, f.stroke).strokeRoundedRect(2, 2, width - 4, height - 4, 7);
      if (asset.assetId === "bed") g.fillStyle(0xb86665).fillRect(width * 0.35, 6, width * 0.58, height - 12);
      g.generateTexture(asset.textureKey, width, height).destroy();
    }
  }

  private createCropFallbacks() {
    for (const stage of Object.values(CROP_ASSETS)) {
      if (this.scene.textures.exists(stage.textureKey)) continue;
      const g = this.scene.add.graphics(); const f = stage.fallback;
      const { width, height } = displayedSize(stage);
      g.fillStyle(f.leaf).fillEllipse(width / 2, height * 0.62, f.size, f.size * 1.8)
        .fillStyle(f.fruit).fillCircle(width / 2, height * 0.41, f.size);
      if (stage.textureKey.endsWith("-3")) g.fillStyle(f.fruit).fillCircle(width * 0.69, height * 0.52, 7);
      g.generateTexture(stage.textureKey, width, height).destroy();
    }
  }
}
