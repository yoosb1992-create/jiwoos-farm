import type { FamilyPresence, FamilyPresenceSnapshot } from "./types";
export const FAMILY_PRESENCE_TTL_MS = 12_000;

/**
 * Merge D1 and realtime presence by player instead of treating either transport
 * as a complete room snapshot. Sites may route WebSocket clients through
 * different isolates when no Durable Object is provisioned; an isolate-local
 * realtime frame must therefore never erase players still fresh in D1.
 */
export const mergeFamilyPresenceSnapshots = (
  previous: FamilyPresenceSnapshot,
  incoming: FamilyPresenceSnapshot,
): FamilyPresenceSnapshot => {
  const serverNow = Math.max(previous.serverNow, incoming.serverNow);
  const latest = new Map<string, FamilyPresence>();
  for (const player of [...previous.players, ...incoming.players]) {
    if (serverNow - player.lastSeen >= FAMILY_PRESENCE_TTL_MS) continue;
    const current = latest.get(player.playerId);
    if (!current || player.lastSeen >= current.lastSeen) latest.set(player.playerId, player);
  }
  return { players: [...latest.values()], serverNow };
};

export const visibleFamilyPlayers = (snapshot: FamilyPresenceSnapshot, ownId: string, mapId: string): FamilyPresence[] =>
  snapshot.players.filter((p) => p.playerId !== ownId && p.mapId === mapId && snapshot.serverNow - p.lastSeen < FAMILY_PRESENCE_TTL_MS);
export const interpolateFamilyPosition = (current: { x: number; y: number }, target: { x: number; y: number }, delta: number) => {
  const factor = 1 - Math.exp(-Math.max(0, delta) / 95);
  return { x: current.x + (target.x - current.x) * factor, y: current.y + (target.y - current.y) * factor };
};
