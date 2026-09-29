import * as Phaser from "phaser";
import type { FarmTileData } from "../domain";
import { CROP_ASSETS, TILE_ASSETS, WORLD_OBJECT_ASSETS, displayedSize, type CropAssetId } from "../assets/definitions";
import { CROP_DEFINITIONS } from "../data/crops";
import { GAME_CONFIG } from "../config";
import { TILE_TYPE_DEFINITIONS, tilePoint } from "../maps/definitions";
import type { MapDefinition, MapId, TileRect } from "../maps/types";
import type { MapRegistry } from "../maps/MapRegistry";
import { FOREST_RESOURCES, resourceKind } from "../forest/resources";
import { PLACEABLE_DEFINITIONS } from "../placeables/definitions";
import type { PlaceableInstance } from "../placeables/types";

const farmKey = (tile: Pick<FarmTileData, "x" | "y">) => `${tile.x},${tile.y}`;

export const collisionRectCenter = (position: { x: number; y: number }, collision: { x: number; y: number; width: number; height: number }) => ({
  x: position.x + collision.x + collision.width / 2,
  y: position.y + collision.y + collision.height / 2,
});

export class WorldRenderer {
  private root?: Phaser.GameObjects.Container;
  private obstacles?: Phaser.Physics.Arcade.StaticGroup;
  private readonly farmViews = new Map<string, Phaser.GameObjects.Container>();
  private readonly forestHitLabels = new Map<string, Phaser.GameObjects.Text>();
  private readonly placeableViews = new Map<string, { image: Phaser.GameObjects.Image; obstacle?: Phaser.GameObjects.Rectangle }>();
  private placeableSignature = "";
  private currentMapId?: MapId;
  constructor(private readonly scene: Phaser.Scene, private readonly maps: MapRegistry) {}

  renderMap(mapId: MapId, farm: Iterable<FarmTileData>) {
    this.destroy();
    const map = this.maps.require(mapId);
    this.currentMapId = mapId;
    this.root = this.scene.add.container(0, 0);
    this.obstacles = this.scene.physics.add.staticGroup();
    const size = GAME_CONFIG.tileSize, width = map.width * size, height = map.height * size;
    const base = TILE_ASSETS[TILE_TYPE_DEFINITIONS[map.baseTileType].graphicAssetId];
    this.root.add(this.scene.add.tileSprite(width / 2, height / 2, width, height, base.textureKey));
    for (const region of map.terrainRegions) this.addRegion(region);
    for (const region of map.collisionRegions) this.addCollisionRegion(region);
    for (const object of map.objects) this.addObject(object);
    if (map.boundary.enabled) this.createBoundary(map);
    this.root.add(this.scene.add.text(20, 18, map.name, { fontFamily: "sans-serif", fontSize: "20px", color: "#fff4d8", fontStyle: "bold", backgroundColor: "#4f633dcc", padding: { x: 10, y: 5 } }).setDepth(30));
    if (mapId === "farm") this.createFarmViews(farm);
    return this.obstacles;
  }

  destroy() {
    this.farmViews.clear(); this.forestHitLabels.clear(); this.placeableViews.clear(); this.placeableSignature = ""; this.root?.destroy(true); this.root = undefined;
    this.obstacles?.clear(true, true); this.obstacles = undefined;
  }

  renderPlaceables(instances: PlaceableInstance[]) {
    if (!this.root || !this.obstacles || !this.currentMapId) return;
    const current = instances.filter(p => p.mapId === this.currentMapId);
    const signature = JSON.stringify(current.map(p => [p.id, p.definitionId, p.tileX, p.tileY]));
    if (signature === this.placeableSignature) return;
    for (const { image, obstacle } of this.placeableViews.values()) {
      this.root.remove(image, true);
      if (obstacle) { this.root.remove(obstacle); this.obstacles.remove(obstacle, true, true); }
    }
    this.placeableViews.clear(); this.placeableSignature = signature;
    for (const instance of current) {
      const definition = PLACEABLE_DEFINITIONS[instance.definitionId], asset = WORLD_OBJECT_ASSETS[definition.assetId];
      const x = (instance.tileX + definition.footprint.width / 2) * GAME_CONFIG.tileSize;
      const y = (instance.tileY + definition.footprint.height / 2) * GAME_CONFIG.tileSize;
      const image = this.makeImage(x, y, asset).setDepth(7);
      this.root.add(image);
      const obstacle = definition.collision ? this.addObstacle(x, y, definition.footprint.width * GAME_CONFIG.tileSize - 4, definition.footprint.height * GAME_CONFIG.tileSize - 4) : undefined;
      this.placeableViews.set(instance.id, { image, obstacle });
    }
    this.obstacles.refresh();
  }

  renderForestHits(hits: Record<string, number>) {
    if (!this.root) return;
    const map = this.maps.get("fairy_forest");
    if (!map) return;
    const active = new Set<string>();
    for (const object of map.objects) {
      const kind = resourceKind(object), count = hits[object.id];
      if (!kind || !Number.isInteger(count) || count <= 0 || count >= FOREST_RESOURCES[kind].hits) continue;
      active.add(object.id);
      const existing = this.forestHitLabels.get(object.id);
      if (existing) existing.setText(`${count}/${FOREST_RESOURCES[kind].hits}`);
      else {
        const position = tilePoint(object.position.tileX, object.position.tileY);
        const label = this.scene.add.text(position.x, position.y - 27, `${count}/${FOREST_RESOURCES[kind].hits}`, {
          fontFamily: "sans-serif", fontSize: "12px", color: "#fff8d3", backgroundColor: "#493727dd", padding: { x: 3, y: 1 },
        }).setOrigin(.5).setDepth(9);
        this.root.add(label); this.forestHitLabels.set(object.id, label);
      }
    }
    for (const [id, label] of this.forestHitLabels) if (!active.has(id)) { label.destroy(); this.forestHitLabels.delete(id); }
  }

  renderFarmTile(tile: FarmTileData) {
    const view = this.farmViews.get(farmKey(tile));
    if (!view) return;
    view.removeAll(true);
    const groundId = tile.wateredToday ? "tile_farm_watered" : tile.tilled ? "tile_farm_tilled" : "tile_farm_empty";
    view.add(this.makeImage(0, 0, TILE_ASSETS[groundId]));
    if (tile.cropType && tile.cropStage !== null) {
      const stage = CROP_DEFINITIONS[tile.cropType].stages[tile.cropStage];
      view.add(this.makeImage(0, 0, CROP_ASSETS[stage.assetId as CropAssetId]));
    }
  }

  private createFarmViews(farm: Iterable<FarmTileData>) {
    for (const tile of farm) {
      const position = tilePoint(tile.x + 0.5, tile.y + 0.5);
      const view = this.scene.add.container(position.x, position.y).setDepth(6);
      this.root!.add(view); this.farmViews.set(farmKey(tile), view); this.renderFarmTile(tile);
    }
  }

  private addRegion(region: TileRect & { tileType: keyof typeof TILE_TYPE_DEFINITIONS; depth?: number }) {
    const size = GAME_CONFIG.tileSize;
    const width = (region.endX - region.startX + 1) * size, height = (region.endY - region.startY + 1) * size;
    const asset = TILE_ASSETS[TILE_TYPE_DEFINITIONS[region.tileType].graphicAssetId];
    this.root!.add(this.scene.add.tileSprite(region.startX * size + width / 2, region.startY * size + height / 2, width, height, asset.textureKey).setDepth(region.depth ?? 1));
  }

  private addObject(object: MapDefinition["objects"][number]) {
    const asset = WORLD_OBJECT_ASSETS[object.assetId];
    const position = tilePoint(object.position.tileX, object.position.tileY);
    const assetDisplaySize = displayedSize(asset);
    const finalDisplaySize = object.displaySizeOverride ?? assetDisplaySize;
    const image = this.makeImage(position.x, position.y, asset).setDepth(object.depth ?? 3)
      .setDisplaySize(finalDisplaySize.width, finalDisplaySize.height);
    this.root!.add(image);
    if (object.collision) {
      const center = collisionRectCenter(position, object.collision);
      this.addObstacle(center.x, center.y, object.collision.width, object.collision.height);
    }
    if (object.label) this.root!.add(this.scene.add.text(position.x, position.y + finalDisplaySize.height / 2 + 6, object.label, { fontFamily: "sans-serif", fontSize: "13px", color: "#fff4d8", fontStyle: "bold", backgroundColor: "#70402dcc", padding: { x: 7, y: 4 } }).setOrigin(0.5).setDepth(8));
  }

  private addCollisionRegion(region: TileRect) {
    const size = GAME_CONFIG.tileSize;
    this.addObstacle((region.startX + region.endX + 1) * size / 2, (region.startY + region.endY + 1) * size / 2, (region.endX - region.startX + 1) * size, (region.endY - region.startY + 1) * size);
  }

  private createBoundary(map: MapDefinition) {
    const size = GAME_CONFIG.tileSize, width = map.width * size, height = map.height * size;
    const openings = map.boundary.openings ?? [];
    const open = (x: number, y: number) => openings.some((r) => x >= r.startX && x <= r.endX && y >= r.startY && y <= r.endY);
    for (let x = 0; x < map.width; x++) {
      if (!open(x, 0)) this.addObstacle(x * size + size / 2, size / 4, size, size / 2);
      if (!open(x, map.height - 1)) this.addObstacle(x * size + size / 2, height - size / 4, size, size / 2);
    }
    for (let y = 1; y < map.height - 1; y++) {
      if (!open(0, y)) this.addObstacle(size / 4, y * size + size / 2, size / 2, size);
      if (!open(map.width - 1, y)) this.addObstacle(width - size / 4, y * size + size / 2, size / 2, size);
    }
  }

  private makeImage(x: number, y: number, asset: Parameters<typeof displayedSize>[0]) {
    const size = displayedSize(asset);
    return this.scene.add.image(x, y, asset.textureKey).setDisplaySize(size.width, size.height).setOrigin(asset.origin.x, asset.origin.y);
  }

  private addObstacle(x: number, y: number, width: number, height: number) {
    const obstacle = this.scene.add.rectangle(x, y, width, height, 0, 0);
    this.scene.physics.add.existing(obstacle, true); this.obstacles!.add(obstacle); this.root!.add(obstacle);
    return obstacle;
  }
}
