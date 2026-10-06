import snapshot from "./legacy-content.json" with { type: "json" };
export interface Rect {
  startX: number;
  endX: number;
  startY: number;
  endY: number;
}
export interface MapObject {
  id: string;
  assetId: string;
  position: { tileX: number; tileY: number };
  collision?: { x: number; y: number; width: number; height: number };
  label?: string;
}
export interface MapData {
  id: string;
  name: string;
  width: number;
  height: number;
  baseTileType: string;
  terrainRegions: Array<Rect & { tileType: string }>;
  farmAreas: Rect[];
  collisionRegions: Rect[];
  objects: MapObject[];
  spawns: Array<{ id: string; tileX: number; tileY: number; facing: string }>;
  warps: Array<{
    id: string;
    area: Rect;
    targetMapId: string;
    targetSpawnId: string;
  }>;
}
export interface Asset {
  assetId: string;
  textureKey: string;
  source: {
    kind: string;
    path: string;
    frameWidth?: number;
    frameHeight?: number;
  } | null;
  frameSize?: { width: number; height: number };
  displayScale?: { x: number; y: number };
  origin?: { x: number; y: number };
}
export const MAPS: Record<string, MapData> = snapshot.maps;
export const ASSETS: Record<string, Asset> = snapshot.assets;
export const CROPS: Record<
  string,
  {
    id: string;
    name: string;
    growthDays: number;
    seedItemId: string;
    harvestItemId: string;
    sellPrice: number;
  }
> = snapshot.crops;
export const ITEMS: Record<
  string,
  {
    id: string;
    name: string;
    kind: string;
    assetId: string;
    sellPrice?: number;
  }
> = snapshot.items;
export const RECIPES: Record<
  string,
  {
    id: string;
    name: string;
    ingredients: Array<{ itemId: string; quantity: number }>;
    output: { itemId: string; quantity: number };
  }
> = snapshot.recipes;
export const NPCS = snapshot.npcs;
export const FISH = snapshot.fish;
export const TILE = 32;
export const FOREST: MapData = {
  id: "forest",
  name: "요정의 숲",
  width: 32,
  height: 24,
  baseTileType: "grass",
  terrainRegions: [],
  farmAreas: [],
  collisionRegions: [],
  objects: [],
  spawns: [{ id: "entry", tileX: 5, tileY: 6, facing: "down" }],
  warps: [
    {
      id: "exit",
      area: { startX: 3, endX: 6, startY: 2, endY: 3 },
      targetMapId: "road",
      targetSpawnId: "farm_entrance",
    },
  ],
};
MAPS.forest = FOREST;
for (let floor = 1; floor <= 5; floor++)
  MAPS[`mine${floor}`] = {
    ...FOREST,
    id: `mine${floor}`,
    name: `광산 ${floor}층`,
    width: 24,
    height: 18,
    baseTileType: "mine_floor",
    warps: [
      {
        id: "exit",
        area: { startX: 3, endX: 6, startY: 2, endY: 3 },
        targetMapId: "road",
        targetSpawnId: "farm_entrance",
      },
    ],
  };
MAPS.road!.warps.push(
  {
    id: "forest",
    area: { startX: 5, endX: 8, startY: 3, endY: 5 },
    targetMapId: "forest",
    targetSpawnId: "entry",
  },
  {
    id: "mine",
    area: { startX: 14, endX: 17, startY: 5, endY: 7 },
    targetMapId: "mine1",
    targetSpawnId: "entry",
  },
);
export function tileIn(rect: Rect, x: number, y: number): boolean {
  return (
    x >= rect.startX && x <= rect.endX && y >= rect.startY && y <= rect.endY
  );
}
export function mapFor(id: string): MapData {
  return MAPS[id] ?? MAPS.farm!;
}
export function itemName(id: string): string {
  return ITEMS[id]?.name ?? id;
}
