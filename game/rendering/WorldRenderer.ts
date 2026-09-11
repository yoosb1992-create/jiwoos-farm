import * as Phaser from "phaser";
import type { FarmTileData } from "../domain";
import { BUILDING_ASSETS, CROP_ASSETS, TILE_ASSETS, displayedSize, type BuildingAssetId, type CropAssetId } from "../assets/definitions";
import { CROP_DEFINITIONS } from "../data/crops";
import { TILE_TYPE_DEFINITIONS, WORLD_MAP, worldPoint, type WorldObjectDefinition } from "../worldData";

const farmKey = (tile: Pick<FarmTileData, "x" | "y">) => `${tile.x},${tile.y}`;

export class WorldRenderer {
  private readonly farmViews = new Map<string, Phaser.GameObjects.Container>();
  constructor(private readonly scene: Phaser.Scene) {}

  createWorld() {
    const worldWidth = WORLD_MAP.width * WORLD_MAP.tileSize;
    const worldHeight = WORLD_MAP.height * WORLD_MAP.tileSize;
    const grass = TILE_ASSETS[TILE_TYPE_DEFINITIONS.grass.graphicAssetId];
    this.scene.add.tileSprite(worldWidth / 2, worldHeight / 2, worldWidth, worldHeight, grass.textureKey);
    for (const region of WORLD_MAP.terrainRegions) {
      const tileAsset = TILE_ASSETS[TILE_TYPE_DEFINITIONS[region.tileType].graphicAssetId];
      this.addTileRegion(region.startX, region.startY, region.endX, region.endY, tileAsset.textureKey, region.depth);
    }

    const obstacles = this.scene.physics.add.staticGroup();
    for (const object of WORLD_MAP.objects) {
      if (object.id !== "pond") this.addWorldObject(object, obstacles);
      else this.addObjectCollision(object, obstacles);
    }
    const house = WORLD_MAP.objects.find((object) => object.id === "house")!;
    const houseInteraction = house.interaction!;
    const housePosition = worldPoint(house.position.tileX, house.position.tileY);
    this.scene.add.text(housePosition.x, houseInteraction.tileY * WORLD_MAP.tileSize + 3, "집 · 잠자기", {
      fontFamily: "sans-serif", fontSize: "13px", color: "#fff4d8", fontStyle: "bold", backgroundColor: "#70402dcc", padding: { x: 7, y: 4 },
    }).setOrigin(0.5).setDepth(8);

    this.createBoundary(obstacles);
    const basket = WORLD_MAP.objects.find((object) => object.id === "sell_basket")!;
    const basketPosition = worldPoint(basket.position.tileX, basket.position.tileY);
    this.scene.add.text(basketPosition.x, basketPosition.y, "판매\n바구니", {
      fontFamily: "sans-serif", fontSize: "15px", color: "#fff4d8", align: "center", fontStyle: "bold",
    }).setOrigin(0.5).setDepth(4);
    this.scene.add.text(WORLD_MAP.farmArea.startX * WORLD_MAP.tileSize, (WORLD_MAP.farmArea.startY - 1) * WORLD_MAP.tileSize, "햇살밭", {
      fontFamily: "sans-serif", fontSize: "18px", color: "#35522f", fontStyle: "bold", backgroundColor: "#f4e3abcc", padding: { x: 10, y: 5 },
    }).setDepth(8);
    return obstacles;
  }

  createFarmViews(farm: Iterable<FarmTileData>) {
    for (const tile of farm) {
      const position = worldPoint(tile.x + 0.5, tile.y + 0.5);
      this.farmViews.set(farmKey(tile), this.scene.add.container(position.x, position.y).setDepth(6));
      this.renderFarmTile(tile);
    }
  }

  renderFarmTile(tile: FarmTileData) {
    const view = this.farmViews.get(farmKey(tile));
    if (!view) return;
    view.removeAll(true);
    const groundId = tile.wateredToday ? "tile_farm_watered" : tile.tilled ? "tile_farm_tilled" : "tile_farm_empty";
    const ground = TILE_ASSETS[groundId];
    view.add(this.makeImage(0, 0, ground));
    if (tile.cropType && tile.cropStage !== null) {
      const stageDefinition = CROP_DEFINITIONS[tile.cropType].stages[tile.cropStage];
      const crop = CROP_ASSETS[stageDefinition.assetId as CropAssetId];
      view.add(this.makeImage(0, 0, crop));
    }
  }

  private makeImage(x: number, y: number, asset: Parameters<typeof displayedSize>[0]) {
    const size = displayedSize(asset);
    return this.scene.add.image(x, y, asset.textureKey).setDisplaySize(size.width, size.height).setOrigin(asset.origin.x, asset.origin.y);
  }

  private addTileRegion(startX: number, startY: number, endX: number, endY: number, textureKey: string, depth: number) {
    const width = (endX - startX + 1) * WORLD_MAP.tileSize;
    const height = (endY - startY + 1) * WORLD_MAP.tileSize;
    this.scene.add.tileSprite(startX * WORLD_MAP.tileSize + width / 2, startY * WORLD_MAP.tileSize + height / 2, width, height, textureKey).setDepth(depth);
  }

  private addWorldObject(object: WorldObjectDefinition, obstacles: Phaser.Physics.Arcade.StaticGroup) {
    const asset = BUILDING_ASSETS[object.assetId as BuildingAssetId];
    if (!asset) return;
    const position = worldPoint(object.position.tileX, object.position.tileY);
    this.makeImage(position.x, position.y, asset).setDepth(object.depth);
    this.addObjectCollision(object, obstacles);
  }

  private addObjectCollision(object: WorldObjectDefinition, obstacles: Phaser.Physics.Arcade.StaticGroup) {
    if (!object.collision.enabled) return;
    const position = worldPoint(object.position.tileX, object.position.tileY);
    this.addObstacle(position.x + object.collision.offsetX, position.y + object.collision.offsetY, object.collision.width, object.collision.height, obstacles);
  }

  private createBoundary(obstacles: Phaser.Physics.Arcade.StaticGroup) {
    const worldWidth = WORLD_MAP.width * WORLD_MAP.tileSize;
    const worldHeight = WORLD_MAP.height * WORLD_MAP.tileSize;
    const definition = WORLD_MAP.boundary;
    const tree = BUILDING_ASSETS[definition.assetId];
    const addTree = (x: number, y: number) => {
      this.makeImage(x, y, tree).setDepth(4);
      this.addObstacle(x, y, definition.collision.width, definition.collision.height, obstacles);
    };
    for (let x = 0; x < WORLD_MAP.width; x += 1) {
      addTree(x * WORLD_MAP.tileSize + WORLD_MAP.tileSize / 2, definition.spriteOffset);
      addTree(x * WORLD_MAP.tileSize + WORLD_MAP.tileSize / 2, worldHeight - definition.spriteOffset);
    }
    for (let y = 1; y < WORLD_MAP.height - 1; y += 1) {
      addTree(WORLD_MAP.tileSize / 2, y * WORLD_MAP.tileSize + WORLD_MAP.tileSize / 2);
      addTree(worldWidth - WORLD_MAP.tileSize / 2, y * WORLD_MAP.tileSize + WORLD_MAP.tileSize / 2);
    }
  }

  private addObstacle(x: number, y: number, width: number, height: number, group: Phaser.Physics.Arcade.StaticGroup) {
    const obstacle = this.scene.add.rectangle(x, y, width, height, 0x000000, 0);
    this.scene.physics.add.existing(obstacle, true);
    group.add(obstacle);
  }
}
