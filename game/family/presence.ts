import type { FamilyPresence, FamilyPresenceSnapshot } from "./types";
export const FAMILY_PRESENCE_TTL_MS = 12_000;
export const visibleFamilyPlayers = (snapshot: FamilyPresenceSnapshot, ownId: string, mapId: string): FamilyPresence[] =>
  snapshot.players.filter((p) => p.playerId !== ownId && p.mapId === mapId && snapshot.serverNow - p.lastSeen < FAMILY_PRESENCE_TTL_MS);
export const interpolateFamilyPosition = (current: { x: number; y: number }, target: { x: number; y: number }, delta: number) => {
  const factor = 1 - Math.exp(-Math.max(0, delta) / 180);
  return { x: current.x + (target.x - current.x) * factor, y: current.y + (target.y - current.y) * factor };
};
