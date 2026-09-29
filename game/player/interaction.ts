import { PLAYER_ASSET, type Facing } from "../assets/definitions";
import { GAME_CONFIG } from "../config";

export interface WorldPoint { x: number; y: number }
export interface TilePoint { x: number; y: number }

/**
 * Derive the player's physical feet from the authored collision box, not from
 * the visible sprite centre. Family requests use this same deterministic
 * calculation when only the sprite position is available on the server.
 */
export function playerFeetPointFromPosition(position: WorldPoint, scale = { x: 1, y: 1 }): WorldPoint {
  const width = PLAYER_ASSET.frameSize.width * scale.x;
  const height = PLAYER_ASSET.frameSize.height * scale.y;
  const left = position.x - width * PLAYER_ASSET.origin.x;
  const top = position.y - height * PLAYER_ASSET.origin.y;
  const body = PLAYER_ASSET.collisionBox;
  return {
    x: left + (body.offsetX + body.width / 2) * scale.x,
    y: top + (body.offsetY + body.height) * scale.y,
  };
}

export function interactionTargetTile(feet: WorldPoint, facing: Facing, tileSize = GAME_CONFIG.tileSize): TilePoint {
  const baseX = Math.floor(feet.x / tileSize), baseY = Math.floor(feet.y / tileSize);
  if (facing === "up") return { x: baseX, y: baseY - 1 };
  if (facing === "down") return { x: baseX, y: baseY + 1 };
  if (facing === "left") return { x: baseX - 1, y: baseY };
  return { x: baseX + 1, y: baseY };
}

export function interactionTargetPoint(feet: WorldPoint, facing: Facing, tileSize = GAME_CONFIG.tileSize): WorldPoint {
  const tile = interactionTargetTile(feet, facing, tileSize);
  return { x: (tile.x + .5) * tileSize, y: (tile.y + .5) * tileSize };
}

export function interactionTargetPointFromPosition(position: WorldPoint, facing: Facing): WorldPoint {
  return interactionTargetPoint(playerFeetPointFromPosition(position), facing);
}

export type FacingActionPriority = "tool" | "interactive" | "npc" | "fallback";
export function facingActionPriority(input: { toolTarget: boolean; interactive: boolean; npc: boolean }): FacingActionPriority {
  if (input.toolTarget) return "tool";
  if (input.interactive) return "interactive";
  if (input.npc) return "npc";
  return "fallback";
}
