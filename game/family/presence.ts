import { GAME_CONFIG } from "../config";
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

/** D1 still carries authoritative tool-action visuals, but when the realtime
 * room is healthy it must never replace WebSocket positions. Overlay only the
 * short-lived action metadata onto the room-authoritative movement snapshot. */
export const overlayFamilyPresenceActions = (
  movement: FamilyPresenceSnapshot,
  actionSource: FamilyPresenceSnapshot,
): FamilyPresenceSnapshot => {
  const actions = new Map(actionSource.players.flatMap((player) =>
    player.action && player.action.expiresAt > actionSource.serverNow ? [[player.playerId, player.action] as const] : []));
  return {
    ...movement,
    players: movement.players.map((player) => {
      const action = actions.get(player.playerId);
      return action ? { ...player, action } : player;
    }),
  };
};

export const visibleFamilyPlayers = (snapshot: FamilyPresenceSnapshot, ownId: string, mapId: string): FamilyPresence[] =>
  snapshot.players.filter((p) => p.playerId !== ownId && p.mapId === mapId && snapshot.serverNow - p.lastSeen < FAMILY_PRESENCE_TTL_MS);

export interface FamilyPresenceVelocity { x: number; y: number }

export const familyPresenceVelocity = (
  previous: FamilyPresence | undefined,
  current: FamilyPresence,
): FamilyPresenceVelocity => {
  if (!previous || !current.moving || previous.mapId !== current.mapId) return { x: 0, y: 0 };
  const elapsedMs = current.lastSeen - previous.lastSeen;
  if (elapsedMs <= 0 || elapsedMs > 500) return { x: 0, y: 0 };
  const seconds = elapsedMs / 1000;
  let x = (current.x - previous.x) / seconds;
  let y = (current.y - previous.y) / seconds;
  const speed = Math.hypot(x, y);
  const maxSpeed = GAME_CONFIG.playerSpeed * 1.8;
  if (speed > maxSpeed && speed > 0) {
    const scale = maxSpeed / speed;
    x *= scale; y *= scale;
  }
  return { x, y };
};

/** Continue the measured network motion for only a tiny window between 30Hz
 * frames. This removes packet-step motion without guessing from facing. */
export const extrapolateFamilyPosition = (
  player: FamilyPresence,
  velocity: FamilyPresenceVelocity,
  serverNow: number,
) => {
  if (!player.moving) return { x: player.x, y: player.y };
  const aheadMs = Math.max(0, Math.min(80, serverNow - player.lastSeen));
  return {
    x: player.x + velocity.x * aheadMs / 1000,
    y: player.y + velocity.y * aheadMs / 1000,
  };
};

export const interpolateFamilyPosition = (current: { x: number; y: number }, target: { x: number; y: number }, delta: number) => {
  const dx = target.x - current.x, dy = target.y - current.y;
  if (Math.hypot(dx, dy) >= 96) return { x: target.x, y: target.y };
  const factor = 1 - Math.exp(-Math.max(0, delta) / 32);
  return { x: current.x + dx * factor, y: current.y + dy * factor };
};
