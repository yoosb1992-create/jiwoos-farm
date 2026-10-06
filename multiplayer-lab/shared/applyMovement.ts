import {
  MAP_HEIGHT, MAP_WIDTH, MAX_MOVEMENT_SUBSTEP, MAX_SIMULATION_DT,
  OBSTACLES, PLAYER_RADIUS, RUN_SPEED, WALK_SPEED,
} from './config.js';

export interface Position { x: number; y: number }
export interface MovementInput { moveX: number; moveY: number; run: boolean }

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

function safeAxis(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.fround(clamp(value, -1, 1)) : 0;
}

/** Never coerce strings, objects, NaN, Infinity or a truthy run value. */
export function sanitizeMovementInput(value: unknown): MovementInput {
  const input = value !== null && typeof value === 'object'
    ? value as Record<string, unknown> : {};
  return {
    moveX: safeAxis(input.moveX),
    moveY: safeAxis(input.moveY),
    run: input.run === true,
  };
}

/** Conservative square collider around the rendered circle, shared by both sides. */
export function collidesWithObstacle(x: number, y: number): boolean {
  return OBSTACLES.some((obstacle) =>
    x + PLAYER_RADIUS > obstacle.x &&
    x - PLAYER_RADIUS < obstacle.x + obstacle.width &&
    y + PLAYER_RADIUS > obstacle.y &&
    y - PLAYER_RADIUS < obstacle.y + obstacle.height);
}

/**
 * Pure deterministic calculation, mutating only x/y. dt is seconds, never a
 * client-supplied elapsed time. The authoritative room passes its fixed ctx.dt;
 * prediction and reconciliation call this exact function with the same dt.
 * Axis-separated substeps allow wall sliding without crossing thin obstacles.
 */
export function applyMovement(position: Position, rawInput: unknown, dtSeconds: number): void {
  if (!Number.isFinite(dtSeconds) || dtSeconds <= 0 || dtSeconds > MAX_SIMULATION_DT) return;
  if (!Number.isFinite(position.x) || !Number.isFinite(position.y)) return;

  const input = sanitizeMovementInput(rawInput);
  const length = Math.hypot(input.moveX, input.moveY);
  const divisor = Math.max(1, length);
  const speed = input.run ? RUN_SPEED : WALK_SPEED;
  const dx = input.moveX / divisor * speed * dtSeconds;
  const dy = input.moveY / divisor * speed * dtSeconds;
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / MAX_MOVEMENT_SUBSTEP));
  const stepX = dx / steps;
  const stepY = dy / steps;

  for (let step = 0; step < steps; step += 1) {
    const x = clamp(position.x + stepX, PLAYER_RADIUS, MAP_WIDTH - PLAYER_RADIUS);
    if (!collidesWithObstacle(x, position.y)) position.x = x;
    const y = clamp(position.y + stepY, PLAYER_RADIUS, MAP_HEIGHT - PLAYER_RADIUS);
    if (!collidesWithObstacle(position.x, y)) position.y = y;
  }
}
