import { familyFetch, type FamilyRealtimePresenceChannel, type FamilyRealtimePresenceContext } from "./client";
import type { FamilyPose, FamilyPresence, FamilyPresenceSnapshot } from "./types";
import type { DedicatedRealtimePose, DedicatedServerFrame } from "./dedicatedProtocol";

export const DEDICATED_REALTIME_SEND_MS = 33;
export const DEDICATED_REALTIME_PING_MS = 1000;
export const DEDICATED_REALTIME_RECONNECT_BASE_MS = 250;
export const DEDICATED_REALTIME_RECONNECT_MAX_MS = 5000;

interface DedicatedRealtimeTicket {
  socketUrl: string;
  expiresAt: number;
}

export interface DedicatedRealtimeSocket {
  readonly readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  addEventListener(type: "open", listener: () => void): void;
  addEventListener(type: "message", listener: (event: { data: unknown }) => void): void;
  addEventListener(type: "close" | "error", listener: () => void): void;
}

export type DedicatedRealtimeSocketFactory = (url: string) => DedicatedRealtimeSocket;

export const dedicatedRealtimeReconnectDelay = (attempt: number) =>
  Math.min(DEDICATED_REALTIME_RECONNECT_MAX_MS, DEDICATED_REALTIME_RECONNECT_BASE_MS * 2 ** Math.min(5, Math.max(0, attempt)));

const toRealtimePose = (pose: FamilyPose): DedicatedRealtimePose => ({
  mapId: pose.mapId,
  x: pose.x,
  y: pose.y,
  vx: pose.velocityX ?? 0,
  vy: pose.velocityY ?? 0,
  facing: pose.facing,
  moving: pose.moving,
  running: pose.running === true,
  selectedTool: pose.selectedTool,
});

const fromRealtimePose = (playerId: string, nickname: string, pose: DedicatedRealtimePose, lastSeen: number): FamilyPresence => ({
  playerId,
  nickname,
  mapId: pose.mapId,
  x: pose.x,
  y: pose.y,
  facing: pose.facing,
  selectedTool: pose.selectedTool as FamilyPose["selectedTool"],
  moving: pose.moving,
  velocityX: pose.vx,
  velocityY: pose.vy,
  running: pose.running,
  lastSeen,
});

const isServerFrame = (value: unknown): value is DedicatedServerFrame => {
  if (!value || typeof value !== "object") return false;
  const frame = value as Partial<DedicatedServerFrame>;
  return typeof frame.t === "string" && ["hello", "join", "leave", "pose", "pong"].includes(frame.t);
};

export class DedicatedFamilyRealtimePresence implements FamilyRealtimePresenceChannel {
  private socket?: DedicatedRealtimeSocket;
  private sendTimer?: ReturnType<typeof setInterval>;
  private pingTimer?: ReturnType<typeof setInterval>;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private context?: FamilyRealtimePresenceContext;
  private peers = new Map<string, FamilyPresence>();
  private sequences = new Map<string, number>();
  private sequence = 0;
  private reconnectAttempt = 0;
  private stopped = true;
  private previousRtt?: number;
  private jitter = 0;

  constructor(
    private readonly socketFactory: DedicatedRealtimeSocketFactory = (url) => new WebSocket(url) as unknown as DedicatedRealtimeSocket,
    private readonly sendEveryMs = DEDICATED_REALTIME_SEND_MS,
    private readonly pingEveryMs = DEDICATED_REALTIME_PING_MS,
  ) {}

  start(context: FamilyRealtimePresenceContext) {
    this.stop();
    this.context = context;
    this.stopped = false;
    this.reconnectAttempt = 0;
    void this.connect();
  }

  stop() {
    this.stopped = true;
    this.context = undefined;
    this.clearTimers();
    this.clearReconnect();
    this.peers.clear();
    this.sequences.clear();
    const socket = this.socket;
    this.socket = undefined;
    if (socket) {
      try { socket.close(1000, "family realtime stopped"); } catch { /* already closed */ }
    }
  }

  flush() {
    this.sendPose();
  }

  private async connect() {
    const context = this.context;
    if (!context || this.stopped) return;
    try {
      const ticket = await familyFetch<DedicatedRealtimeTicket>("/api/family/realtime", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ roomId: context.roomId, sessionId: context.sessionId }),
      });
      if (this.context !== context || this.stopped) return;
      const socket = this.socketFactory(ticket.socketUrl);
      this.socket = socket;

      socket.addEventListener("open", () => {
        if (this.socket !== socket || this.stopped) return;
        this.reconnectAttempt = 0;
        context.onConnect();
        context.onTransport?.("dedicated");
        this.sendPose();
        this.sendPing();
        this.clearTimers();
        this.sendTimer = setInterval(() => this.sendPose(), this.sendEveryMs);
        this.pingTimer = setInterval(() => this.sendPing(), this.pingEveryMs);
      });
      socket.addEventListener("message", (event) => {
        if (this.socket !== socket || typeof event.data !== "string") return;
        this.receive(event.data);
      });
      socket.addEventListener("close", () => {
        if (this.socket !== socket) return;
        this.socket = undefined;
        this.clearTimers();
        this.peers.clear();
        this.sequences.clear();
        if (this.stopped) return;
        context.onDisconnect();
        context.onSnapshot({ players: [], serverNow: Date.now() });
        this.scheduleReconnect();
      });
      socket.addEventListener("error", () => {
        // Browsers normally emit close after error; reconnect is handled there.
      });
    } catch {
      if (this.context !== context || this.stopped) return;
      context.onDisconnect();
      context.onSnapshot({ players: [], serverNow: Date.now() });
      this.scheduleReconnect();
    }
  }

  private receive(raw: string) {
    const context = this.context;
    if (!context || this.stopped) return;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!isServerFrame(parsed)) return;
      const frame = parsed as DedicatedServerFrame;
      if (frame.t === "hello") {
        this.peers.clear();
        this.sequences.clear();
        const now = Date.now();
        for (const peer of frame.peers) {
          if (!peer.pose) continue;
          this.peers.set(peer.playerId, fromRealtimePose(peer.playerId, peer.nickname, peer.pose, now));
          this.sequences.set(peer.playerId, peer.seq);
        }
        this.emitSnapshot();
        return;
      }
      if (frame.t === "leave") {
        this.peers.delete(frame.playerId);
        this.sequences.delete(frame.playerId);
        this.emitSnapshot();
        return;
      }
      if (frame.t === "pose") {
        const previous = this.sequences.get(frame.playerId) ?? -1;
        if (frame.seq <= previous) return;
        this.sequences.set(frame.playerId, frame.seq);
        this.peers.set(frame.playerId, fromRealtimePose(frame.playerId, frame.nickname, frame.pose, Date.now()));
        this.emitSnapshot();
        return;
      }
      if (frame.t === "pong") {
        const rtt = Math.max(0, Date.now() - frame.clientTime);
        if (this.previousRtt !== undefined) {
          const sample = Math.abs(rtt - this.previousRtt);
          this.jitter = this.jitter ? this.jitter * 0.8 + sample * 0.2 : sample;
        }
        this.previousRtt = rtt;
        context.onDiagnostics?.({ rttMs: Math.round(rtt), jitterMs: Math.round(this.jitter) });
      }
    } catch {
      // A malformed transient frame is dropped; persistent state is unaffected.
    }
  }

  private sendPose() {
    const socket = this.socket;
    const context = this.context;
    if (!socket || socket.readyState !== 1 || !context || this.stopped) return;
    const pose = context.pose();
    if (!pose) return;
    try {
      socket.send(JSON.stringify({ t: "pose", seq: ++this.sequence, pose: toRealtimePose(pose) }));
    } catch {
      // Socket close/reconnect owns recovery.
    }
  }

  private sendPing() {
    const socket = this.socket;
    if (!socket || socket.readyState !== 1 || this.stopped) return;
    try { socket.send(JSON.stringify({ t: "ping", clientTime: Date.now() })); } catch { /* close handles recovery */ }
  }

  private emitSnapshot() {
    const context = this.context;
    if (!context || this.stopped) return;
    const now = Date.now();
    const ownPose = context.pose();
    const own = ownPose ? fromRealtimePose(context.playerId, context.nickname, toRealtimePose(ownPose), now) : undefined;
    context.onSnapshot({ players: [...(own ? [own] : []), ...this.peers.values()], serverNow: now });
  }

  private scheduleReconnect() {
    if (this.stopped || !this.context || this.reconnectTimer !== undefined) return;
    const delay = dedicatedRealtimeReconnectDelay(this.reconnectAttempt++);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      void this.connect();
    }, delay);
  }

  private clearTimers() {
    if (this.sendTimer !== undefined) clearInterval(this.sendTimer);
    if (this.pingTimer !== undefined) clearInterval(this.pingTimer);
    this.sendTimer = undefined;
    this.pingTimer = undefined;
  }

  private clearReconnect() {
    if (this.reconnectTimer !== undefined) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
  }
}
