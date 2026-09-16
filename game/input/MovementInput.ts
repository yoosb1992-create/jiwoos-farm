import type { Facing } from "../assets/definitions";

export interface MovementVector { x: number; y: number }

const clampAxis = (value: number) => Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : 0;

export function normalizeMovement(vector: MovementVector): MovementVector {
  const x = clampAxis(vector.x), y = clampAxis(vector.y);
  const length = Math.hypot(x, y);
  if (length <= 1) return { x, y };
  return { x: x / length, y: y / length };
}

export function mergeMovementInput(keyboard: MovementVector, virtual: MovementVector): MovementVector {
  const touch = normalizeMovement(virtual);
  if (Math.abs(touch.x) > 0.01 || Math.abs(touch.y) > 0.01) return touch;
  return normalizeMovement(keyboard);
}

export function facingFromMovement(vector: MovementVector, current: Facing): Facing {
  if (Math.abs(vector.x) < 0.01 && Math.abs(vector.y) < 0.01) return current;
  if (Math.abs(vector.x) > Math.abs(vector.y)) return vector.x < 0 ? "left" : "right";
  return vector.y < 0 ? "up" : "down";
}
