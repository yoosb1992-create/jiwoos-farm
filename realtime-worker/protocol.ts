export type Facing = "up" | "down" | "left" | "right";

export interface RealtimePose {
  mapId: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: Facing;
  moving: boolean;
  running: boolean;
  selectedTool: string;
}

export type ClientFrame =
  | { t: "pose"; seq: number; pose: RealtimePose }
  | { t: "ping"; clientTime: number };

export type ServerFrame =
  | { t: "hello"; playerId: string; peers: Array<{ playerId: string; nickname: string; pose?: RealtimePose; seq: number }> }
  | { t: "join"; playerId: string; nickname: string }
  | { t: "leave"; playerId: string }
  | { t: "pose"; playerId: string; nickname: string; seq: number; serverTime: number; pose: RealtimePose }
  | { t: "pong"; clientTime: number; serverTime: number };

export const MAX_FRAME_BYTES = 2048;

export function parseClientFrame(raw: unknown): ClientFrame | null {
  if (typeof raw !== "string" || raw.length > MAX_FRAME_BYTES) return null;
  try {
    const value = JSON.parse(raw) as Partial<ClientFrame>;
    if (value.t === "ping" && Number.isFinite(value.clientTime)) {
      return { t: "ping", clientTime: Number(value.clientTime) };
    }
    if (value.t !== "pose" || !Number.isSafeInteger(value.seq) || Number(value.seq) < 0 || !value.pose || typeof value.pose !== "object") {
      return null;
    }
    const pose = value.pose as Partial<RealtimePose>;
    if (
      typeof pose.mapId !== "string" || pose.mapId.length < 1 || pose.mapId.length > 64 ||
      !Number.isFinite(pose.x) || !Number.isFinite(pose.y) ||
      !Number.isFinite(pose.vx) || !Number.isFinite(pose.vy) ||
      !["up", "down", "left", "right"].includes(String(pose.facing)) ||
      typeof pose.moving !== "boolean" || typeof pose.running !== "boolean" ||
      typeof pose.selectedTool !== "string" || pose.selectedTool.length > 32
    ) return null;

    return {
      t: "pose",
      seq: Number(value.seq),
      pose: {
        mapId: pose.mapId,
        x: Number(pose.x),
        y: Number(pose.y),
        vx: Number(pose.vx),
        vy: Number(pose.vy),
        facing: pose.facing as Facing,
        moving: pose.moving,
        running: pose.running,
        selectedTool: pose.selectedTool,
      },
    };
  } catch {
    return null;
  }
}
