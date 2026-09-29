import { DEFAULT_CHARACTER_VISUAL_PROFILE, type CharacterVisualProfile, type Facing } from "../assets/definitions";
import { GAME_CONFIG } from "../config";

export interface WorldPoint { x: number; y: number }
export interface TilePoint { x: number; y: number }

/** Keep the directional anchor inside the lower body instead of on the exact
 * foot edge. This prevents a few pixels of movement near a tile boundary from
 * flipping the interaction row before the character has meaningfully crossed. */
const defaultBody = DEFAULT_CHARACTER_VISUAL_PROFILE.asset.collisionBox;
export const INTERACTION_ANCHOR_BODY_RATIO =
  (DEFAULT_CHARACTER_VISUAL_PROFILE.interactionAnchor.y - defaultBody.offsetY) / defaultBody.height;

/**
 * Derive the player's physical feet from the authored collision box, not from
 * the visible sprite centre. Family requests use this same deterministic
 * calculation when only the sprite position is available on the server.
 */
export function playerFeetPointFromPosition(position: WorldPoint, scale = { x: 1, y: 1 }, profile: CharacterVisualProfile = DEFAULT_CHARACTER_VISUAL_PROFILE): WorldPoint {
  const { asset } = profile;
  const width = asset.frameSize.width * scale.x;
  const height = asset.frameSize.height * scale.y;
  const left = position.x - width * asset.origin.x;
  const top = position.y - height * asset.origin.y;
  const body = asset.collisionBox;
  return {
    x: left + (body.offsetX + body.width / 2) * scale.x,
    y: top + (body.offsetY + body.height) * scale.y,
  };
}

export function playerInteractionAnchorFromPosition(position: WorldPoint, scale = { x: 1, y: 1 }, profile: CharacterVisualProfile = DEFAULT_CHARACTER_VISUAL_PROFILE): WorldPoint {
  const { asset, interactionAnchor } = profile;
  const width = asset.frameSize.width * scale.x;
  const height = asset.frameSize.height * scale.y;
  const left = position.x - width * asset.origin.x;
  const top = position.y - height * asset.origin.y;
  return {
    x: left + interactionAnchor.x * scale.x,
    y: top + interactionAnchor.y * scale.y,
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

export function interactionTargetPointFromPosition(position: WorldPoint, facing: Facing, profile: CharacterVisualProfile = DEFAULT_CHARACTER_VISUAL_PROFILE): WorldPoint {
  return interactionTargetPoint(playerInteractionAnchorFromPosition(position, { x: 1, y: 1 }, profile), facing);
}

export type FacingActionPriority = "tool" | "interactive" | "npc" | "fallback";
export function facingActionPriority(input: { toolTarget: boolean; interactive: boolean; npc: boolean }): FacingActionPriority {
  if (input.toolTarget) return "tool";
  if (input.interactive) return "interactive";
  if (input.npc) return "npc";
  return "fallback";
}
