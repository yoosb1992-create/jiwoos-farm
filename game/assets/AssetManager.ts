import * as Phaser from "phaser";
import { BUILDING_ASSETS, CROP_ASSETS, ITEM_ASSETS, PLAYER_ASSET, TILE_ASSETS, displayedSize, type AssetSource } from "./definitions";

const loadSource = (scene: Phaser.Scene, key: string, source: AssetSource) => {
  if (!source) return;
  if (source.kind === "spritesheet") scene.load.spritesheet(key, source.path, { frameWidth: source.frameWidth, frameHeight: source.frameHeight });
  else scene.load.image(key, source.path);
};

export class AssetManager {
  constructor(private readonly scene: Phaser.Scene) {}

  preload() {
    loadSource(this.scene, PLAYER_ASSET.textureKey, PLAYER_ASSET.source);
    Object.values(TILE_ASSETS).forEach((asset) => loadSource(this.scene, asset.textureKey, asset.source));
    Object.values(BUILDING_ASSETS).forEach((asset) => loadSource(this.scene, asset.textureKey, asset.source));
    Object.values(CROP_ASSETS).forEach((asset) => loadSource(this.scene, asset.textureKey, asset.source));
    Object.values(ITEM_ASSETS).forEach((asset) => loadSource(this.scene, asset.textureKey, asset.source));
  }

  createFallbackTextures() {
    if (!this.scene.textures.exists(PLAYER_ASSET.textureKey)) this.createPlayerFallback();
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
    for (const [name, definition] of Object.entries(PLAYER_ASSET.animations)) {
      if (this.scene.anims.exists(name)) continue;
      const frames = PLAYER_ASSET.source?.kind === "spritesheet"
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
    const house = BUILDING_ASSETS.house;
    if (!this.scene.textures.exists(house.textureKey)) {
      const g = this.scene.add.graphics(); const f = house.fallback;
      const { width, height } = displayedSize(house);
      g.fillStyle(f.wall).fillRect(0, 30, width, height - 30).lineStyle(8, f.trim).strokeRect(4, 34, width - 8, height - 38)
        .fillStyle(f.roof).fillTriangle(0, 55, width, 55, width / 2, 0).fillStyle(f.door).fillRect(width / 2 - 22, height - 80, 44, 60)
        .generateTexture(house.textureKey, width, height).destroy();
    }
    const tree = BUILDING_ASSETS.tree;
    if (!this.scene.textures.exists(tree.textureKey)) {
      const g = this.scene.add.graphics(); const f = tree.fallback;
      g.fillStyle(f.trunk).fillRect(18, 29, 8, 22).fillStyle(f.crown).fillCircle(22, 17, 19)
        .fillStyle(f.highlight).fillCircle(13, 22, 11).generateTexture(tree.textureKey, displayedSize(tree).width, displayedSize(tree).height).destroy();
    }
    const basket = BUILDING_ASSETS.sell_basket;
    if (!this.scene.textures.exists(basket.textureKey)) {
      const g = this.scene.add.graphics(); const f = basket.fallback;
      const { width, height } = displayedSize(basket);
      g.fillStyle(f.fill).fillRect(3, 3, width - 6, height - 6).lineStyle(6, f.stroke).strokeRect(3, 3, width - 6, height - 6)
        .generateTexture(basket.textureKey, width, height).destroy();
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
