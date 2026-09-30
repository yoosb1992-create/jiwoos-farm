import type { MapDefinition, TileTypeId } from "../maps/types";

type TerrainRegion = MapDefinition["terrainRegions"][number];

const contains = (region: TerrainRegion, x: number, y: number) =>
  x >= region.startX && x <= region.endX && y >= region.startY && y <= region.endY;

export function appendTerrainPaintCell(regions: TerrainRegion[], tileType: TileTypeId, x: number, y: number) {
  const last = regions.at(-1);
  if (last?.tileType === tileType && contains(last, x, y)) return false;
  if (last?.tileType === tileType && last.startY === last.endY && last.startY === y) {
    if (x === last.endX + 1) { last.endX = x; return true; }
    if (x === last.startX - 1) { last.startX = x; return true; }
  }
  if (last?.tileType === tileType && last.startX === last.endX && last.startX === x) {
    if (y === last.endY + 1) { last.endY = y; return true; }
    if (y === last.startY - 1) { last.startY = y; return true; }
  }
  regions.push({ startX: x, endX: x, startY: y, endY: y, tileType });
  return true;
}

export const editorGridStep = (width: number, height: number, maxLines = 700) =>
  Math.max(1, Math.ceil((Math.max(1, width) + Math.max(1, height)) / Math.max(1, maxLines)));
