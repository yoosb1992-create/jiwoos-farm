import { parseFamilyPose } from "../../game/family/personal";
import type { FamilyPose, FamilyPresence, FamilyPresenceSnapshot } from "../../game/family/types";

export const FAMILY_REALTIME_MAX_FRAME_BYTES = 2048;
export const FAMILY_REALTIME_SIGNAL_MAX_FRAME_BYTES = 32_768;
export const FAMILY_REALTIME_SESSION_RE = /^[a-f0-9-]{36}$/;
export const FAMILY_REALTIME_PLAYER_RE = /^[a-f0-9-]{36}$/;

export type FamilyRtcSignal =
  | { kind: "offer" | "answer"; sdp: string }
  | { kind: "ice"; candidate: { candidate: string; sdpMid?: string | null; sdpMLineIndex?: number | null; usernameFragment?: string | null } };

export interface FamilyRealtimeSignalFrame {
  targetPlayerId: string;
  signal: FamilyRtcSignal;
}

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

export const parseFamilyRtcSignalValue = (raw: unknown): FamilyRtcSignal | null => {
  if (!raw || typeof raw !== "object") return null;
  const signal = raw as Partial<FamilyRtcSignal> & { kind?: unknown };
  if ((signal.kind === "offer" || signal.kind === "answer") && typeof signal.sdp === "string" && signal.sdp.length <= 24_000) {
    return { kind: signal.kind, sdp: signal.sdp };
  }
  if (signal.kind === "ice") {
    const candidate = (signal as { candidate?: unknown }).candidate;
    if (!candidate || typeof candidate !== "object") return null;
    const value = candidate as { candidate?: unknown; sdpMid?: unknown; sdpMLineIndex?: unknown; usernameFragment?: unknown };
    if (typeof value.candidate !== "string" || value.candidate.length > 4_096) return null;
    return {
      kind: "ice",
      candidate: {
        candidate: value.candidate,
        ...(typeof value.sdpMid === "string" || value.sdpMid === null ? { sdpMid: value.sdpMid as string | null } : {}),
        ...(Number.isInteger(value.sdpMLineIndex) || value.sdpMLineIndex === null ? { sdpMLineIndex: value.sdpMLineIndex as number | null } : {}),
        ...(typeof value.usernameFragment === "string" || value.usernameFragment === null ? { usernameFragment: value.usernameFragment as string | null } : {}),
      },
    };
  }
  return null;
};

export const parseFamilyRealtimeSignalFrame = (
  raw: unknown,
  expectedRoomId: string,
  expectedSessionId: string,
): FamilyRealtimeSignalFrame | null => {
  if (typeof raw !== "string" || raw.length > FAMILY_REALTIME_SIGNAL_MAX_FRAME_BYTES) return null;
  try {
    const frame = JSON.parse(raw) as {
      type?: unknown;
      roomId?: unknown;
      sessionId?: unknown;
      targetPlayerId?: unknown;
      signal?: unknown;
    };
    if (frame.type !== "signal" || frame.roomId !== expectedRoomId || frame.sessionId !== expectedSessionId ||
        typeof frame.targetPlayerId !== "string" || !FAMILY_REALTIME_PLAYER_RE.test(frame.targetPlayerId)) return null;
    const signal = parseFamilyRtcSignalValue(frame.signal);
    return signal ? { targetPlayerId: frame.targetPlayerId, signal } : null;
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
