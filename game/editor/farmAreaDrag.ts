import type { TileRect } from "../maps/types";

export type FarmAreaDragHandle =
  | "move"
  | "n" | "s" | "e" | "w"
  | "ne" | "nw" | "se" | "sw";

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function moveFarmArea(
  rect: TileRect,
  deltaX: number,
  deltaY: number,
  mapWidth: number,
  mapHeight: number,
): TileRect {
  const width = rect.endX - rect.startX;
  const height = rect.endY - rect.startY;
  const startX = clamp(rect.startX + Math.round(deltaX), 0, Math.max(0, mapWidth - 1 - width));
  const startY = clamp(rect.startY + Math.round(deltaY), 0, Math.max(0, mapHeight - 1 - height));
  return { startX, endX: startX + width, startY, endY: startY + height };
}

export function resizeFarmArea(
  rect: TileRect,
  handle: Exclude<FarmAreaDragHandle, "move">,
  tileX: number,
  tileY: number,
  mapWidth: number,
  mapHeight: number,
): TileRect {
  const x = clamp(Math.floor(tileX), 0, Math.max(0, mapWidth - 1));
  const y = clamp(Math.floor(tileY), 0, Math.max(0, mapHeight - 1));
  const next = { ...rect };
  if (handle.includes("w")) next.startX = Math.min(x, rect.endX);
  if (handle.includes("e")) next.endX = Math.max(x, rect.startX);
  if (handle.includes("n")) next.startY = Math.min(y, rect.endY);
  if (handle.includes("s")) next.endY = Math.max(y, rect.startY);
  return next;
}

export const sameTileRect = (a: TileRect, b: TileRect) =>
  a.startX === b.startX && a.endX === b.endX && a.startY === b.startY && a.endY === b.endY;
