import * as Phaser from "phaser";
import type { FarmTileData } from "../domain";
import { CROP_ASSETS, TILE_ASSETS, WORLD_OBJECT_ASSETS, displayedSize, type CropAssetId } from "../assets/definitions";
import { FARM_TERRAIN_DECORATIONS, TERRAIN_COMPOSITION_ASSETS, type CardinalDirection, type CornerDirection, type TerrainCompositionAssetId } from "../assets/terrainComposition";
import { TERRAIN_GRAPHICS_PROFILE } from "../assets/graphicsFoundation";
import { CROP_DEFINITIONS } from "../data/crops";
import { GAME_CONFIG } from "../config";
import { TILE_TYPE_DEFINITIONS, getTileTypeInMap, tilePoint } from "../maps/definitions";
import type { MapDefinition, MapId, TileRect } from "../maps/types";
import type { MapRegistry } from "../maps/MapRegistry";
import { FOREST_RESOURCES, resourceKind } from "../forest/resources";
import { mineResourceKind, MINE_RESOURCES } from "../mine/resources";
import { mineFloorFromMapId } from "../mine/generation";
import { PLACEABLE_DEFINITIONS } from "../placeables/definitions";
import type { PlaceableInstance } from "../placeables/types";
import { BUILDING_DEFINITIONS } from "../buildings/definitions";
import type { BuildingInstance } from "../buildings/types";
import type { AnimalInstance } from "../animals/types";
import { ANIMAL_DEFINITIONS } from "../animals/definitions";
import { FARM_TREE_RESOURCE, isFarmTreeObject } from "../farm/trees";
import type { CropId } from "../data/crops";

const farmKey = (tile: Pick<FarmTileData, "x" | "y">) => `${tile.x},${tile.y}`;

const PLANTED_SEED_ACCENTS: Record<CropId, number> = {
  sproutberry: 0xb9d35b,
  sunpotato: 0xe6b443,
  heartberry: 0xe75c65,
  morningcarrot: 0xf08b32,
};
export const plantedSeedAccent = (cropId: CropId) => PLANTED_SEED_ACCENTS[cropId];
export const PLANTED_SEED_MARKER_OFFSET = { x: 0, y: 2 } as const;

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
  private readonly buildingViews = new Map<string, { image: Phaser.GameObjects.Image; obstacle: Phaser.GameObjects.Rectangle }>();
  private buildingSignature = "";
  private readonly animalViews: Phaser.GameObjects.Image[] = [];
  private animalSignature = "";
  private currentMapId?: MapId;
  constructor(private readonly scene: Phaser.Scene, private readonly maps: MapRegistry) {}

  renderMap(mapId: MapId, farm: Iterable<FarmTileData>, hiddenObjectIds: ReadonlySet<string> = new Set()) {
    this.destroy();
    const map = this.maps.require(mapId);
    this.currentMapId = mapId;
    this.root = this.scene.add.container(0, 0);
    this.obstacles = this.scene.physics.add.staticGroup();
    const size = GAME_CONFIG.tileSize, width = map.width * size, height = map.height * size;
    const base = TILE_ASSETS[TILE_TYPE_DEFINITIONS[map.baseTileType].graphicAssetId];
    this.root.add(this.scene.add.tileSprite(width / 2, height / 2, width, height, base.textureKey));
    for (const region of map.terrainRegions) this.addRegion(region);
    this.addTerrainComposition(map);
    if (mapId === "farm") this.addFarmDecorations();
    for (const region of map.collisionRegions) this.addCollisionRegion(region);
    for (const object of map.objects) if (!hiddenObjectIds.has(object.id)) this.addObject(object);
    if (map.boundary.enabled) this.createBoundary(map);
    this.root.add(this.scene.add.text(20, 18, map.name, { fontFamily: "sans-serif", fontSize: "20px", color: "#fff4d8", fontStyle: "bold", backgroundColor: "#4f633dcc", padding: { x: 10, y: 5 } }).setDepth(30));
    if (mapId === "farm") this.createFarmViews(farm);
    return this.obstacles;
  }

  destroy() {
    this.farmViews.clear(); this.forestHitLabels.clear(); this.placeableViews.clear(); this.placeableSignature = ""; this.buildingViews.clear(); this.buildingSignature = ""; this.animalViews.length = 0; this.animalSignature = ""; this.root?.destroy(true); this.root = undefined;
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

  renderBuildings(instances: BuildingInstance[]) {
    if (!this.root || !this.obstacles || !this.currentMapId) return;
    const current = instances.filter(b => b.mapId === this.currentMapId);
    const signature = JSON.stringify(current.map(b => [b.id, b.definitionId, b.tileX, b.tileY, b.status]));
    if (signature === this.buildingSignature) return;
    for (const { image, obstacle } of this.buildingViews.values()) {
      this.root.remove(image, true); this.root.remove(obstacle); this.obstacles.remove(obstacle, true, true);
    }
    this.buildingViews.clear(); this.buildingSignature = signature;
    for (const instance of current) {
      const definition = BUILDING_DEFINITIONS[instance.definitionId], asset = WORLD_OBJECT_ASSETS[definition.assetId];
      const x = (instance.tileX + definition.footprint.width / 2) * GAME_CONFIG.tileSize;
      const y = (instance.tileY + definition.footprint.height / 2) * GAME_CONFIG.tileSize;
      const image = this.makeImage(x, y, asset).setDepth(7).setAlpha(instance.status === "ready" ? 1 : .65);
      this.root.add(image);
      const obstacle = this.addObstacle(instance.tileX * GAME_CONFIG.tileSize + definition.collision.x + definition.collision.width / 2,
        instance.tileY * GAME_CONFIG.tileSize + definition.collision.y + definition.collision.height / 2,
        definition.collision.width, definition.collision.height);
      this.buildingViews.set(instance.id, { image, obstacle });
    }
    this.obstacles.refresh();
  }

  renderAnimals(animals: AnimalInstance[], buildings: BuildingInstance[]) {
    if (!this.root || !this.currentMapId) return;
    const homes = new Map(buildings.filter(b => b.mapId === this.currentMapId && b.definitionId === "chicken_coop").map(b => [b.id, b]));
    const current = animals.filter(a => homes.has(a.homeBuildingId));
    const signature = JSON.stringify([current.map(a => [a.id, a.homeBuildingId, a.lastFedDaySerial, a.produceReady]), [...homes.keys()]]);
    if (signature === this.animalSignature) return;
    for (const view of this.animalViews) this.root.remove(view, true);
    this.animalViews.length = 0; this.animalSignature = signature;
    for (const home of homes.values()) {
      const troughAsset = WORLD_OBJECT_ASSETS.feed_trough;
      const trough = this.makeImage((home.tileX + .7) * GAME_CONFIG.tileSize, (home.tileY + 3.25) * GAME_CONFIG.tileSize, troughAsset).setDepth(8);
      this.root.add(trough); this.animalViews.push(trough);
    }
    current.forEach((animal, index) => {
      const home = homes.get(animal.homeBuildingId)!;
      const sameHome = current.filter(a => a.homeBuildingId === animal.homeBuildingId), homeIndex = sameHome.findIndex(a => a.id === animal.id);
      const offsets = [{ x: 1.4, y: 3.35 }, { x: 2.2, y: 3.45 }, { x: 3, y: 3.3 }, { x: 2.6, y: 3.9 }];
      const offset = offsets[homeIndex % offsets.length], asset = WORLD_OBJECT_ASSETS[ANIMAL_DEFINITIONS[animal.species].assetId];
      const image = this.makeImage((home.tileX + offset.x) * GAME_CONFIG.tileSize, (home.tileY + offset.y) * GAME_CONFIG.tileSize, asset).setDepth(9 + index * .001);
      this.root!.add(image); this.animalViews.push(image);
    });
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

  renderMineHits(hits: Record<string, number>) {
    if (!this.root || !this.currentMapId || mineFloorFromMapId(this.currentMapId) === null) return;
    const map = this.maps.get(this.currentMapId);
    if (!map) return;
    const active = new Set<string>();
    for (const object of map.objects) {
      const kind = mineResourceKind(object), count = hits[object.id];
      if (!kind || !Number.isInteger(count) || count <= 0 || count >= MINE_RESOURCES[kind].hits) continue;
      active.add(object.id);
      const existing = this.forestHitLabels.get(object.id);
      if (existing) existing.setText(`${count}/${MINE_RESOURCES[kind].hits}`);
      else {
        const position = tilePoint(object.position.tileX, object.position.tileY);
        const label = this.scene.add.text(position.x, position.y - 27, `${count}/${MINE_RESOURCES[kind].hits}`, {
          fontFamily: "sans-serif", fontSize: "12px", color: "#fff8d3", backgroundColor: "#493727dd", padding: { x: 3, y: 1 },
        }).setOrigin(.5).setDepth(9);
        this.root.add(label); this.forestHitLabels.set(object.id, label);
      }
    }
    for (const [id, label] of this.forestHitLabels) if (!active.has(id)) { label.destroy(); this.forestHitLabels.delete(id); }
  }

  renderFarmTreeHits(hits: Record<string, number>) {
    if (!this.root || this.currentMapId !== "farm") return;
    const map = this.maps.get("farm");
    if (!map) return;
    const active = new Set<string>();
    for (const object of map.objects) {
      const count = hits[object.id];
      if (!isFarmTreeObject(object) || !Number.isInteger(count) || count <= 0 || count >= FARM_TREE_RESOURCE.hits) continue;
      active.add(object.id);
      const existing = this.forestHitLabels.get(object.id);
      if (existing) existing.setText(`${count}/${FARM_TREE_RESOURCE.hits}`);
      else {
        const position = tilePoint(object.position.tileX, object.position.tileY);
        const label = this.scene.add.text(position.x, position.y - 34, `${count}/${FARM_TREE_RESOURCE.hits}`, {
          fontFamily: "sans-serif", fontSize: "12px", color: "#fff8d3", backgroundColor: "#493727dd", padding: { x: 3, y: 1 },
        }).setOrigin(.5).setDepth(9);
        this.root.add(label); this.forestHitLabels.set(object.id, label);
      }
    }
    for (const [id, label] of this.forestHitLabels) if (!active.has(id)) { label.destroy(); this.forestHitLabels.delete(id); }
  }

  renderFarmTile(tile: FarmTileData) {
    let view = this.farmViews.get(farmKey(tile));
    if (!view && this.root && this.currentMapId === "farm") {
      const position = tilePoint(tile.x + .5, tile.y + .5);
      view = this.scene.add.container(position.x, position.y).setDepth(6);
      this.root.add(view); this.farmViews.set(farmKey(tile), view);
    }
    if (!view) return;
    view.removeAll(true);
    const groundId = tile.wateredToday ? "tile_farm_watered" : tile.tilled ? "tile_farm_tilled" : "tile_farm_empty";
    view.add(this.makeImage(0, 0, TILE_ASSETS[groundId]));
    this.addFarmBorder(view, tile);
    if (tile.cropType && tile.cropStage !== null) {
      const stage = CROP_DEFINITIONS[tile.cropType].stages[tile.cropStage];
      if (tile.cropStage === 0) {
        const planted = this.scene.add.graphics();
        const { x, y } = PLANTED_SEED_MARKER_OFFSET;
        planted.fillStyle(0x5f3e2d, .95).fillEllipse(x, y, 21, 10)
          .lineStyle(1, 0x3f2c23, .8).strokeEllipse(x, y, 21, 10)
          .fillStyle(plantedSeedAccent(tile.cropType), 1)
          .fillCircle(x - 5, y - 2, 2).fillCircle(x, y + 1, 2).fillCircle(x + 5, y - 2, 2);
        view.add(planted);
      }
      view.add(this.makeImage(0, 0, CROP_ASSETS[stage.assetId as CropAssetId]));
    }
  }

  private createFarmViews(farm: Iterable<FarmTileData>) {
    for (const tile of farm) {
      this.renderFarmTile(tile);
    }
  }

  private addRegion(region: TileRect & { tileType: keyof typeof TILE_TYPE_DEFINITIONS; depth?: number }) {
    const size = GAME_CONFIG.tileSize;
    const width = (region.endX - region.startX + 1) * size, height = (region.endY - region.startY + 1) * size;
    const asset = TILE_ASSETS[TILE_TYPE_DEFINITIONS[region.tileType].graphicAssetId];
    this.root!.add(this.scene.add.tileSprite(region.startX * size + width / 2, region.startY * size + height / 2, width, height, asset.textureKey).setDepth(region.depth ?? 1));
  }

  private addTerrainComposition(map: MapDefinition) {
    const size = GAME_CONFIG.tileSize;
    for (let y = 0; y < map.height; y++) for (let x = 0; x < map.width; x++) {
      const tileType = getTileTypeInMap(map, x, y);
      if (tileType !== "path" && tileType !== "water") continue;
      const same = (dx: number, dy: number) => getTileTypeInMap(map, x + dx, y + dy) === tileType;
      const cardinal: Record<CardinalDirection, boolean> = {
        north: same(0, -1), east: same(1, 0), south: same(0, 1), west: same(-1, 0),
      };
      const diagonal: Record<CornerDirection, boolean> = {
        northWest: same(-1, -1), northEast: same(1, -1), southEast: same(1, 1), southWest: same(-1, 1),
      };
      const centerX = (x + .5) * size, centerY = (y + .5) * size;
      if (tileType === "path") {
        const profile = TERRAIN_GRAPHICS_PROFILE.path;
        for (const direction of Object.keys(cardinal) as CardinalDirection[]) {
          if (!cardinal[direction]) this.addCompositionImage(centerX, centerY, profile.edgeAssetIds[direction], 1.12);
        }
        this.addCornerComposition(centerX, centerY, cardinal, diagonal, profile.outerCornerAssetIds, profile.innerCornerAssetIds, 1.13);
      } else {
        const profile = TERRAIN_GRAPHICS_PROFILE.water;
        for (const direction of Object.keys(cardinal) as CardinalDirection[]) {
          if (!cardinal[direction]) this.addCompositionImage(centerX, centerY, profile.edgeAssetIds[direction], 1.12);
        }
        this.addOuterCorners(centerX, centerY, cardinal, profile.cornerAssetIds, 1.13);
      }
    }
  }

  private addCornerComposition(
    x: number,
    y: number,
    cardinal: Record<CardinalDirection, boolean>,
    diagonal: Record<CornerDirection, boolean>,
    outerAssets: Record<CornerDirection, TerrainCompositionAssetId>,
    innerAssets: Record<CornerDirection, TerrainCompositionAssetId>,
    depth: number,
  ) {
    this.addOuterCorners(x, y, cardinal, outerAssets, depth);
    const corners: Array<[CornerDirection, CardinalDirection, CardinalDirection]> = [
      ["northWest", "north", "west"], ["northEast", "north", "east"],
      ["southEast", "south", "east"], ["southWest", "south", "west"],
    ];
    for (const [corner, first, second] of corners) {
      if (cardinal[first] && cardinal[second] && !diagonal[corner]) this.addCompositionImage(x, y, innerAssets[corner], depth);
    }
  }

  private addOuterCorners(
    x: number,
    y: number,
    cardinal: Record<CardinalDirection, boolean>,
    assets: Record<CornerDirection, TerrainCompositionAssetId>,
    depth: number,
  ) {
    const corners: Array<[CornerDirection, CardinalDirection, CardinalDirection]> = [
      ["northWest", "north", "west"], ["northEast", "north", "east"],
      ["southEast", "south", "east"], ["southWest", "south", "west"],
    ];
    for (const [corner, first, second] of corners) {
      if (!cardinal[first] && !cardinal[second]) this.addCompositionImage(x, y, assets[corner], depth);
    }
  }

  private addFarmBorder(view: Phaser.GameObjects.Container, tile: FarmTileData) {
    const map = this.currentMapId ? this.maps.get(this.currentMapId) : undefined;
    if (!map) return;
    const isFarm = (x: number, y: number) => map.farmAreas.some((area) => x >= area.startX && x <= area.endX && y >= area.startY && y <= area.endY);
    const cardinal: Record<CardinalDirection, boolean> = {
      north: isFarm(tile.x, tile.y - 1), east: isFarm(tile.x + 1, tile.y), south: isFarm(tile.x, tile.y + 1), west: isFarm(tile.x - 1, tile.y),
    };
    const profile = TERRAIN_GRAPHICS_PROFILE.farm;
    for (const direction of Object.keys(cardinal) as CardinalDirection[]) {
      if (!cardinal[direction]) {
        const image = this.makeCompositionImage(0, 0, profile.borderAssetIds[direction]);
        if (image) view.add(image);
      }
    }
    const corners: Array<[CornerDirection, CardinalDirection, CardinalDirection]> = [
      ["northWest", "north", "west"], ["northEast", "north", "east"],
      ["southEast", "south", "east"], ["southWest", "south", "west"],
    ];
    for (const [corner, first, second] of corners) if (!cardinal[first] && !cardinal[second]) {
      const image = this.makeCompositionImage(0, 0, profile.cornerAssetIds[corner]);
      if (image) view.add(image);
    }
  }

  private addFarmDecorations() {
    for (const placement of FARM_TERRAIN_DECORATIONS) {
      const image = this.makeCompositionImage(placement.tileX * GAME_CONFIG.tileSize, placement.tileY * GAME_CONFIG.tileSize, placement.assetId);
      if (!image) continue;
      image.setDepth(placement.depth ?? 2.4).setAlpha(placement.alpha ?? 1).setFlipX(placement.flipX ?? false);
      this.root!.add(image);
    }
  }

  private addCompositionImage(x: number, y: number, assetId: TerrainCompositionAssetId, depth: number) {
    const image = this.makeCompositionImage(x, y, assetId);
    if (!image) return;
    image.setDepth(depth); this.root!.add(image);
  }

  private makeCompositionImage(x: number, y: number, assetId: TerrainCompositionAssetId) {
    const asset = TERRAIN_COMPOSITION_ASSETS[assetId];
    if (!this.scene.textures.exists(asset.textureKey)) return undefined;
    return this.makeImage(x, y, asset);
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
