import { getTileTypeInMap } from "../maps/definitions";
import type { MapDefinition, TileTypeId } from "../maps/types";

export type TerrainCompositionTileType = Extract<TileTypeId, "path" | "water">;
export type TerrainCompositionTile = { x: number; y: number; tileType: TerrainCompositionTileType };

const needsComposition = (type: TileTypeId): type is TerrainCompositionTileType => type === "path" || type === "water";

const tileTypeAt = (map: MapDefinition, x: number, y: number) => {
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) return null;
  return getTileTypeInMap(map, x, y);
};

/**
 * Returns only tiles that can actually need path/water edge decoration.
 * Grass-based large maps therefore scale with authored path/water area rather
 * than width × height.
 */
const terrainCompositionTilesImpl = (map: MapDefinition): TerrainCompositionTile[] => {
  const candidates = new Map<string, { x: number; y: number }>();
  const add = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= map.width || y >= map.height) return;
    candidates.set(`${x},${y}`, { x, y });
  };

  if (needsComposition(map.baseTileType)) {
    for (let y = 0; y < map.height; y++) for (let x = 0; x < map.width; x++) add(x, y);
  } else {
    for (const region of map.terrainRegions) {
      if (!needsComposition(region.tileType)) continue;
      const startX = Math.max(0, region.startX), endX = Math.min(map.width - 1, region.endX);
      const startY = Math.max(0, region.startY), endY = Math.min(map.height - 1, region.endY);
      for (let y = startY; y <= endY; y++) for (let x = startX; x <= endX; x++) add(x, y);
    }
  }

  const result: TerrainCompositionTile[] = [];
  for (const { x, y } of candidates.values()) {
    const tileType = tileTypeAt(map, x, y);
    if (tileType && needsComposition(tileType)) result.push({ x, y, tileType });
  }
  return result;
};

export const terrainCompositionTiles = Object.assign(terrainCompositionTilesImpl, { tileTypeAt });
