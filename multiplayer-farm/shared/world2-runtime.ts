import {
  npcSchedule,
  type NpcDefinition,
  type MapData,
  TILE,
} from "./content.js";
import { findPath } from "./pathfinding.js";
import type { Point } from "./pathfinding.js";
const routes = new WeakMap<MapData, Map<string, Point[]>>();
/** Identical path interpolation for visual NPCs, navigation and server interaction range. */
export function worldNpcSchedule(
  npc: NpcDefinition,
  day: number,
  minute: number,
  maps: Record<string, MapData>,
) {
  const points = Object.values(maps)
    .flatMap((m) =>
      (m.world2?.npcRoutes.find((r) => r.id === npc.id)?.points ?? []).map(
        (p) => ({ ...p, mapId: m.id }),
      ),
    )
    .sort((a, b) => a.minute - b.minute);
  if (!points.length) return npcSchedule(npc, day, minute);
  let i = 0;
  for (let k = 0; k < points.length; k++)
    if (points[k]!.minute <= minute) i = k;
  const p = points[i]!,
    next = points[i + 1];
  let position = { x: p.x, y: p.y };
  if (next && next.mapId === p.mapId && next.minute > p.minute) {
    const map = maps[p.mapId]!,
      key = `${npc.id}:${i}`;
    let cache = routes.get(map);
    if (!cache) routes.set(map, (cache = new Map()));
    let path = cache.get(key);
    if (!path) {
      path = [
        { x: p.x * TILE, y: p.y * TILE },
        ...(findPath(
          p.mapId,
          { x: p.x * TILE, y: p.y * TILE },
          (q) =>
            Math.floor(q.x / TILE) === Math.floor(next.x) &&
            Math.floor(q.y / TILE) === Math.floor(next.y),
          maps,
        ) ?? []),
      ];
      cache.set(key, path);
    }
    const step = Math.min(
        path.length - 1,
        ((minute - p.minute) / (next.minute - p.minute)) * (path.length - 1),
      ),
      a = path[Math.floor(step)]!,
      b = path[Math.min(path.length - 1, Math.floor(step) + 1)]!,
      t = step % 1;
    position = {
      x: (a.x + (b.x - a.x) * t) / TILE,
      y: (a.y + (b.y - a.y) * t) / TILE,
    };
  }
  return {
    minute: p.minute,
    mapId: p.mapId,
    from: position,
    to: position,
    facing: p.facing,
    activity: p.animation || "산책",
    dialogue: p.dialogue,
  };
}
export function invalidateRoutes(m: MapData) {
  routes.delete(m);
}
