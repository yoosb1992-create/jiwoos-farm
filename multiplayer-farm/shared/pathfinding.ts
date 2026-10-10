import { elevationPass } from "./world2.js";
import { TILE, type MapData } from "./content.js";
import {
  collidesWithObstacle,
  type DynamicObstacle,
} from "./applyMovement.js";
export interface Point {
  x: number;
  y: number;
}
/** Bounded breadth-first grid path. Goals can be target-adjacent cells or a portal region. */
export function findPath(
  area: string,
  start: Point,
  goal: (p: Point) => boolean,
  maps: Record<string, MapData>,
  dynamic?: Iterable<DynamicObstacle>,
): Point[] | undefined {
  const m = maps[area];
  if (!m) return;
  const n = m.width * m.height,
    seen = new Int32Array(n).fill(-2),
    queue = new Int32Array(n);
  const sx = Math.max(0, Math.min(m.width - 1, Math.floor(start.x / TILE))),
    sy = Math.max(0, Math.min(m.height - 1, Math.floor(start.y / TILE))),
    first = sy * m.width + sx;
  seen[first] = -1;
  queue[0] = first;
  let tail = 1;
  for (let head = 0; head < tail; head++) {
    const i = queue[head]!,
      x = i % m.width,
      y = Math.floor(i / m.width),
      p = { x: (x + 0.5) * TILE, y: (y + 0.5) * TILE };
    if (!collidesWithObstacle(p.x, p.y, area, maps, dynamic) && goal(p)) {
      const result: Point[] = [];
      let k = i;
      while (k !== first && k >= 0) {
        result.push({
          x: ((k % m.width) + 0.5) * TILE,
          y: (Math.floor(k / m.width) + 0.5) * TILE,
        });
        k = seen[k]!;
      }
      result.reverse();
      return result.length ? result : [p];
    }
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const xx = x + dx,
        yy = y + dy,
        j = yy * m.width + xx;
      if (xx < 0 || yy < 0 || xx >= m.width || yy >= m.height || seen[j] !== -2)
        continue;
      const nx = (xx + 0.5) * TILE,
        ny = (yy + 0.5) * TILE;
      if (
        !elevationPass(m, p.x, p.y, nx, ny) ||
        collidesWithObstacle(nx, ny, area, maps, dynamic) ||
        collidesWithObstacle((nx + p.x) / 2, (ny + p.y) / 2, area, maps, dynamic)
      )
        continue;
      seen[j] = i;
      queue[tail++] = j;
    }
  }
}
