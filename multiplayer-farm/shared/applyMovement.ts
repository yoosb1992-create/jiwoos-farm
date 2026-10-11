import {
  blockedTile,
  nearbyObjects,
  hasZone,
  elevationPass,
} from "./world2.js";
import {
  MAX_MOVEMENT_SUBSTEP,
  MAX_SIMULATION_DT,
  PLAYER_RADIUS,
  RUN_SPEED,
  WALK_SPEED,
} from "./config.js";
import { mapFor, TILE, tileIn, type MapData } from "./content.js";
export interface Position {
  x: number;
  y: number;
  area?: string;
  stamina?: number;
  facing?: string;
  moving?: boolean;
  running?: boolean;
  actionTicks?: number;
}
export interface MovementInput {
  moveX: number;
  moveY: number;
  /** Optional turn-in-place intent. It changes facing without translating. */
  faceX?: number;
  faceY?: number;
  run: boolean;
}
const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
const axis = (v: unknown) =>
  typeof v === "number" && Number.isFinite(v)
    ? Math.fround(clamp(v, -1, 1))
    : 0;
export function sanitizeMovementInput(v: unknown): MovementInput {
  const i = v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  return {
    moveX: axis(i.moveX),
    moveY: axis(i.moveY),
    faceX: axis(i.faceX),
    faceY: axis(i.faceY),
    run: i.run === true,
  };
}
export interface DynamicObstacle {
  area: string;
  x: number;
  y: number;
  kind: string;
  asset?: string;
  stage?: number;
}
interface DynamicObstacleBox {
  halfW: number;
  halfH: number;
  offsetY: number;
}
export interface DynamicObstacleIndex {
  readonly buckets: Map<string, readonly DynamicObstacle[]>;
}
export type DynamicObstacleSource =
  | Iterable<DynamicObstacle>
  | DynamicObstacleIndex;

const dynamicObstacleBox = (e: DynamicObstacle): DynamicObstacleBox | undefined => {
  if (e.kind === "tree") {
    const mature = (e.stage ?? 2) >= 2;
    return { halfW: mature ? 15 : 11, halfH: mature ? 11 : 9, offsetY: -7 };
  }
  if (e.kind === "stump") return { halfW: 14, halfH: 10, offsetY: -4 };
  if (e.kind === "rock") return { halfW: 14, halfH: 12, offsetY: -2 };
  if (e.kind === "twig") return { halfW: 15, halfH: 9, offsetY: -1 };
  if (["machine", "decoration", "barn", "trough"].includes(e.kind))
    return { halfW: 14, halfH: 14, offsetY: 0 };
  if (e.kind === "gather" && /weed/.test(e.asset ?? ""))
    return { halfW: 10, halfH: 10, offsetY: 0 };
  return undefined;
};
const obstacleKey = (area: string, tx: number, ty: number) =>
  `${area}:${tx},${ty}`;

export function prepareDynamicObstacles(
  source?: DynamicObstacleSource,
): DynamicObstacleIndex | undefined {
  if (!source) return undefined;
  if ("buckets" in source) return source;
  const buckets = new Map<string, DynamicObstacle[]>();
  for (const e of source) {
    if (!dynamicObstacleBox(e)) continue;
    const key = obstacleKey(
      e.area,
      Math.floor(e.x / TILE),
      Math.floor(e.y / TILE),
    );
    const list = buckets.get(key);
    if (list) list.push(e);
    else buckets.set(key, [e]);
  }
  return { buckets };
}
export function collidesWithObstacle(
  x: number,
  y: number,
  area = "farm",
  maps?: Record<string, MapData>,
  dynamic?: DynamicObstacleSource,
): boolean {
  const map = mapFor(area, maps);
  if (
    x < PLAYER_RADIUS ||
    y < PLAYER_RADIUS ||
    x > map.width * TILE - PLAYER_RADIUS ||
    y > map.height * TILE - PLAYER_RADIUS
  )
    return true;
  if (map.world2) {
    for (
      let ty = Math.floor((y - PLAYER_RADIUS + 0.001) / TILE);
      ty <= Math.floor((y + PLAYER_RADIUS - 0.001) / TILE);
      ty++
    )
      for (
        let tx = Math.floor((x - PLAYER_RADIUS + 0.001) / TILE);
        tx <= Math.floor((x + PLAYER_RADIUS - 0.001) / TILE);
        tx++
      )
        if (blockedTile(map, tx, ty)) return true;
  }
  const hit = (a: number, b: number, w: number, h: number) =>
    x + PLAYER_RADIUS > a &&
    x - PLAYER_RADIUS < a + w &&
    y + PLAYER_RADIUS > b &&
    y - PLAYER_RADIUS < b + h;
  if (
    map.collisionRegions.some((r) =>
      hit(
        r.startX * TILE,
        r.startY * TILE,
        (r.endX - r.startX + 1) * TILE,
        (r.endY - r.startY + 1) * TILE,
      ),
    )
  )
    return true;
  const obstacleIndex = prepareDynamicObstacles(dynamic);
  if (obstacleIndex) {
    const cx = Math.floor(x / TILE), cy = Math.floor(y / TILE);
    for (let ty = cy - 1; ty <= cy + 1; ty++)
      for (let tx = cx - 1; tx <= cx + 1; tx++)
        for (const e of obstacleIndex.buckets.get(obstacleKey(area, tx, ty)) ?? []) {
          const box = dynamicObstacleBox(e);
          if (
            box &&
            hit(
              e.x - box.halfW,
              e.y + box.offsetY - box.halfH,
              box.halfW * 2,
              box.halfH * 2,
            )
          )
            return true;
        }
  }
  return (
    map.world2 ? nearbyObjects(map, x / TILE, y / TILE) : map.objects
  ).some(
    (o) =>
      o.visible !== false &&
      !o.bridge &&
      o.collision &&
      // Harvestable trees keep their existing dynamic behavior. Authored static
      // trees must honor their small trunk box, just like other static objects.
      !(o.assetId.startsWith("tree") && o.kind === "tree") &&
      hit(
        o.position.tileX * TILE + o.collision.x,
        o.position.tileY * TILE + o.collision.y,
        o.collision.width,
        o.collision.height,
      ),
  );
}
export function applyMovement(
  p: Position,
  raw: unknown,
  dt: number,
  maps?: Record<string, MapData>,
  dynamic?: DynamicObstacleSource,
): void {
  if (
    !Number.isFinite(dt) ||
    dt <= 0 ||
    dt > MAX_SIMULATION_DT ||
    !Number.isFinite(p.x) ||
    !Number.isFinite(p.y)
  )
    return;
  const i = sanitizeMovementInput(raw);
  // MapSchema.values()/Array.values() is one-shot. Reuse one prepared snapshot
  // for X, Y and every movement substep so vertical/diagonal motion cannot bypass it.
  const obstacles = prepareDynamicObstacles(dynamic);
  const length = Math.hypot(i.moveX, i.moveY);
  const faceLength = Math.hypot(i.faceX ?? 0, i.faceY ?? 0);
  const active = length > 0.01;
  p.moving = active;
  p.running = active && i.run && (p.stamina ?? 100) > 0;
  if ((p.actionTicks ?? 0) > 0) {
    p.actionTicks = Math.max(0, (p.actionTicks ?? 0) - 1);
    p.moving = false;
    p.running = false;
    return;
  }
  if (active)
    p.facing =
      Math.abs(i.moveX) > Math.abs(i.moveY)
        ? i.moveX > 0
          ? "right"
          : "left"
        : i.moveY > 0
          ? "down"
          : "up";
  else if (faceLength > 0.01)
    p.facing =
      Math.abs(i.faceX ?? 0) > Math.abs(i.faceY ?? 0)
        ? (i.faceX ?? 0) > 0
          ? "right"
          : "left"
        : (i.faceY ?? 0) > 0
          ? "down"
          : "up";
  const speed = p.running ? RUN_SPEED : WALK_SPEED;
  const dx = (i.moveX / Math.max(1, length)) * speed * dt,
    dy = (i.moveY / Math.max(1, length)) * speed * dt;
  const steps = Math.max(
    1,
    Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / MAX_MOVEMENT_SUBSTEP),
  );
  for (let s = 0; s < steps; s++) {
    if (
      elevationPass(
        mapFor(p.area ?? "farm", maps),
        p.x,
        p.y,
        p.x + dx / steps,
        p.y,
      ) &&
      !collidesWithObstacle(p.x + dx / steps, p.y, p.area, maps, obstacles)
    )
      p.x += dx / steps;
    if (
      elevationPass(
        mapFor(p.area ?? "farm", maps),
        p.x,
        p.y,
        p.x,
        p.y + dy / steps,
      ) &&
      !collidesWithObstacle(p.x, p.y + dy / steps, p.area, maps, obstacles)
    )
      p.y += dy / steps;
  }
  if (p.running && p.stamina !== undefined)
    p.stamina = Math.max(0, p.stamina - dt * 2);
}
export function frontTile(p: Position): { tileX: number; tileY: number } {
  const x =
      p.x + (p.facing === "right" ? TILE : p.facing === "left" ? -TILE : 0),
    y = p.y + (p.facing === "down" ? TILE : p.facing === "up" ? -TILE : 0);
  return { tileX: Math.floor(x / TILE), tileY: Math.floor(y / TILE) };
}
export function isFarmable(
  area: string,
  x: number,
  y: number,
  maps?: Record<string, MapData>,
): boolean {
  const m = mapFor(area, maps);
  return m.world2
    ? hasZone(m, "farmable", x, y) && !blockedTile(m, x, y)
    : m.farmAreas.some((r) => tileIn(r, x, y));
}
