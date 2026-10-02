import { parseFamilyPose } from "../../game/family/personal";
import type { FamilyPose, FamilyPresence, FamilyPresenceSnapshot } from "../../game/family/types";

export const FAMILY_REALTIME_MAX_FRAME_BYTES = 2048;
export const FAMILY_REALTIME_SESSION_RE = /^[a-f0-9-]{36}$/;

export interface FamilyRealtimeConnectionState {
  roomId: string;
  sessionId: string;
  playerId: string;
  nickname: string;
  pose?: FamilyPose;
  lastSeen: number;
}

export const parseFamilyRealtimeFrame = (
  raw: unknown,
  expectedRoomId: string,
  expectedSessionId: string,
): FamilyPose | null => {
  if (typeof raw !== "string" || raw.length > FAMILY_REALTIME_MAX_FRAME_BYTES) return null;
  try {
    const frame = JSON.parse(raw) as {
      type?: unknown;
      roomId?: unknown;
      sessionId?: unknown;
      pose?: unknown;
    };
    if (frame.type !== "presence" || frame.roomId !== expectedRoomId || frame.sessionId !== expectedSessionId) return null;
    return parseFamilyPose(frame.pose);
  } catch {
    return null;
  }
};

export const familyRealtimeSnapshot = (
  states: Iterable<FamilyRealtimeConnectionState>,
  now = Date.now(),
): FamilyPresenceSnapshot => {
  const latest = new Map<string, FamilyPresence>();
  for (const state of states) {
    if (!state.pose) continue;
    const previous = latest.get(state.playerId);
    if (!previous || state.lastSeen >= previous.lastSeen) {
      latest.set(state.playerId, {
        ...state.pose,
        playerId: state.playerId,
        nickname: state.nickname,
        lastSeen: state.lastSeen,
      });
    }
  }
  return { players: [...latest.values()], serverNow: now };
};
