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
  run: boolean;
}
const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
const axis = (v: unknown) =>
  typeof v === "number" && Number.isFinite(v)
    ? Math.fround(clamp(v, -1, 1))
    : 0;
export function sanitizeMovementInput(v: unknown): MovementInput {
  const i = v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  return { moveX: axis(i.moveX), moveY: axis(i.moveY), run: i.run === true };
}
export function collidesWithObstacle(
  x: number,
  y: number,
  area = "farm",
  maps?: Record<string, MapData>,
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
  // Dynamic harvestables are interaction targets, not prediction colliders. Static buildings/fences use identical geometry on both sides.
  return (
    map.world2 ? nearbyObjects(map, x / TILE, y / TILE) : map.objects
  ).some(
    (o) =>
      o.visible !== false &&
      !o.bridge &&
      o.collision &&
      !o.assetId.startsWith("tree") &&
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
  const length = Math.hypot(i.moveX, i.moveY);
  const active = length > 0.01;
  p.moving = active;
  p.running = active && i.run && (p.stamina ?? 100) > 0;
  if (active)
    p.facing =
      Math.abs(i.moveX) > Math.abs(i.moveY)
        ? i.moveX > 0
          ? "right"
          : "left"
        : i.moveY > 0
          ? "down"
          : "up";
  if ((p.actionTicks ?? 0) > 0) {
    p.actionTicks = Math.max(0, (p.actionTicks ?? 0) - 1);
    p.moving = false;
    p.running = false;
    return;
  }
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
      !collidesWithObstacle(p.x + dx / steps, p.y, p.area, maps)
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
      !collidesWithObstacle(p.x, p.y + dy / steps, p.area, maps)
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
