import { MAP_DEFINITIONS } from "../maps/definitions";
import { GAME_CONFIG } from "../config";
import type { FamilyPose } from "./types";

export function parseFamilyPose(value: unknown): FamilyPose | null {
  if (!value || typeof value !== "object") return null;
  const p = value as FamilyPose;
  if (typeof p.mapId !== "string" || !Object.hasOwn(MAP_DEFINITIONS, p.mapId)) return null;
  const map = MAP_DEFINITIONS[p.mapId];
  if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || p.x < 0 || p.y < 0 || p.x > map.width * GAME_CONFIG.tileSize || p.y > map.height * GAME_CONFIG.tileSize) return null;
  if (!["up", "down", "left", "right"].includes(p.facing) || !["hoe", "seed", "water", "hand"].includes(p.selectedTool) || typeof p.moving !== "boolean") return null;
  return { mapId: p.mapId, x: p.x, y: p.y, facing: p.facing, selectedTool: p.selectedTool, moving: p.moving };
}
export const familyPersonalKey = (roomId: string, playerId: string) => `jiwoos-farm.family-personal.v1:${roomId}:${playerId}`;
