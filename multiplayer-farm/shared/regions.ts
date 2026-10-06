import { TILE, mapFor, tileIn, type MapData } from "./content.js";
import { collidesWithObstacle } from "./applyMovement.js";
export const TRANSITION_COOLDOWN_MS = 1400;
export function insideWarp(map: MapData, x: number, y: number) {
  return map.warps.find((w) =>
    tileIn(w.area, Math.floor(x / TILE), Math.floor(y / TILE)),
  );
}
/** Prefer a walkable spawn outside all portals; bounded search also repairs old spawn data. */
export function safeSpawn(
  area: string,
  spawnId: string | undefined,
  maps: Record<string, MapData>,
  avoidWarps = true,
) {
  const map = mapFor(area, maps),
    s = map.spawns.find((p) => p.id === spawnId) ?? map.spawns[0]!;
  const valid = (x: number, y: number) =>
    !collidesWithObstacle(x, y, area, maps) &&
    (!avoidWarps || !insideWarp(map, x, y));
  if (valid(s.tileX * TILE, s.tileY * TILE))
    return { x: s.tileX * TILE, y: s.tileY * TILE, facing: s.facing };
  for (let r = 0; r < Math.max(map.width, map.height); r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = (Math.floor(s.tileX) + dx + 0.5) * TILE,
          y = (Math.floor(s.tileY) + dy + 0.5) * TILE;
        if (valid(x, y)) return { x, y, facing: s.facing };
      }
  throw Error("이 지역에 이동 가능한 spawn이 없습니다");
}
