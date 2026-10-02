import type { TileRect } from "./types";

export const WORLD_CHUNK_SIZE = 32;

export interface WorldChunkCoordinate { chunkX: number; chunkY: number }

export const worldChunkForTile = (tileX: number, tileY: number, size = WORLD_CHUNK_SIZE): WorldChunkCoordinate => ({
  chunkX: Math.floor(tileX / size),
  chunkY: Math.floor(tileY / size),
});

export const worldChunkKey = ({ chunkX, chunkY }: WorldChunkCoordinate) => `${chunkX},${chunkY}`;

export const worldChunkBounds = ({ chunkX, chunkY }: WorldChunkCoordinate, size = WORLD_CHUNK_SIZE): TileRect => ({
  startX: chunkX * size,
  endX: chunkX * size + size - 1,
  startY: chunkY * size,
  endY: chunkY * size + size - 1,
});

export const worldChunksForRect = (rect: TileRect, size = WORLD_CHUNK_SIZE): WorldChunkCoordinate[] => {
  const first = worldChunkForTile(rect.startX, rect.startY, size);
  const last = worldChunkForTile(rect.endX, rect.endY, size);
  const chunks: WorldChunkCoordinate[] = [];
  for (let chunkY = first.chunkY; chunkY <= last.chunkY; chunkY++) {
    for (let chunkX = first.chunkX; chunkX <= last.chunkX; chunkX++) chunks.push({ chunkX, chunkY });
  }
  return chunks;
};
