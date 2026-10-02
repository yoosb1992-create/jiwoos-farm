import type { FamilyRealtimePresenceChannel, FamilyRealtimePresenceContext } from "./client";
import type { FamilyPresenceSnapshot } from "./types";

export const REALTIME_PRESENCE_SEND_MS = 100;
export const REALTIME_PRESENCE_RECONNECT_BASE_MS = 300;
export const REALTIME_PRESENCE_RECONNECT_MAX_MS = 5000;

export interface FamilyPresenceSocket {
  readonly readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  addEventListener(type: "open", listener: () => void): void;
  addEventListener(type: "message", listener: (event: { data: unknown }) => void): void;
  addEventListener(type: "close" | "error", listener: () => void): void;
}

export type FamilyPresenceSocketFactory = (url: string) => FamilyPresenceSocket;
export type FamilyPresenceUrlFactory = (context: Pick<FamilyRealtimePresenceContext, "roomId" | "sessionId">) => string;

export const browserFamilyPresenceUrl: FamilyPresenceUrlFactory = ({ roomId, sessionId }) => {
  const location = globalThis.location;
  const protocol = location?.protocol === "https:" ? "wss:" : "ws:";
  const host = location?.host || "localhost";
  return `${protocol}//${host}/api/family/presence/socket?roomId=${encodeURIComponent(roomId)}&sessionId=${encodeURIComponent(sessionId)}`;
};

export const realtimePresenceReconnectDelay = (attempt: number, base = REALTIME_PRESENCE_RECONNECT_BASE_MS) =>
  Math.min(REALTIME_PRESENCE_RECONNECT_MAX_MS, Math.max(50, base) * 2 ** Math.min(5, Math.max(0, attempt)));

const isSnapshot = (value: unknown): value is FamilyPresenceSnapshot => {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<FamilyPresenceSnapshot>;
  return Array.isArray(candidate.players) && Number.isFinite(candidate.serverNow);
};

/**
 * Fast movement/presence plane. Authoritative farming, inventory and world
 * mutations remain on the D1-backed Family APIs.
 *
 * WebSocket reconnect is automatic. FamilyClient simultaneously keeps a
 * low-rate D1 heartbeat alive so a WebSocket outage degrades to the existing
 * safe presence path instead of dropping multiplayer state.
 */
export class WebSocketFamilyRealtimePresence implements FamilyRealtimePresenceChannel {
  private socket?: FamilyPresenceSocket;
  private timer?: ReturnType<typeof setInterval>;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private context?: FamilyRealtimePresenceContext;
  private reconnectAttempt = 0;
  private stopped = true;

  constructor(
    private readonly url: FamilyPresenceUrlFactory,
    private readonly socketFactory: FamilyPresenceSocketFactory = (value) => new WebSocket(value) as unknown as FamilyPresenceSocket,
    private readonly sendEveryMs = REALTIME_PRESENCE_SEND_MS,
    private readonly reconnectBaseMs = REALTIME_PRESENCE_RECONNECT_BASE_MS,
  ) {}

  start(context: FamilyRealtimePresenceContext) {
    this.stop();
    this.context = context;
    this.stopped = false;
    this.reconnectAttempt = 0;
    this.connect();
  }

  stop() {
    this.stopped = true;
    this.context = undefined;
    this.clearReconnect();
    const socket = this.socket;
    this.socket = undefined;
    this.clearTimer();
    if (socket) socket.close(1000, "family presence stopped");
  }

  private connect() {
    const context = this.context;
    if (!context || this.stopped) return;
    let socket: FamilyPresenceSocket;
    try {
      socket = this.socketFactory(this.url(context));
    } catch {
      context.onDisconnect();
      this.scheduleReconnect();
      return;
    }
    this.socket = socket;

    const send = () => {
      if (this.socket !== socket || socket.readyState !== 1) return;
      const pose = context.pose();
      if (!pose) return;
      socket.send(JSON.stringify({
        type: "presence",
        roomId: context.roomId,
        sessionId: context.sessionId,
        pose,
      }));
    };

    socket.addEventListener("open", () => {
      if (this.socket !== socket || this.stopped) return;
      this.reconnectAttempt = 0;
      send();
      this.clearTimer();
      this.timer = setInterval(send, this.sendEveryMs);
    });
    socket.addEventListener("message", (event) => {
      if (this.socket !== socket || typeof event.data !== "string") return;
      try {
        const parsed: unknown = JSON.parse(event.data);
        if (isSnapshot(parsed)) context.onSnapshot(parsed);
      } catch {
        // Ignore malformed realtime frames; the D1 plane remains authoritative.
      }
    });
    socket.addEventListener("close", () => {
      if (this.socket !== socket) return;
      this.clearTimer();
      this.socket = undefined;
      if (this.stopped) return;
      context.onDisconnect();
      this.scheduleReconnect();
    });
    socket.addEventListener("error", () => {
      // Browser WebSocket implementations normally follow this with "close".
      // Until then the D1 heartbeat remains active.
    });
  }

  private scheduleReconnect() {
    if (this.stopped || !this.context || this.reconnectTimer !== undefined) return;
    const delay = realtimePresenceReconnectDelay(this.reconnectAttempt++, this.reconnectBaseMs);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      this.connect();
    }, delay);
  }

  private clearTimer() {
    if (this.timer !== undefined) clearInterval(this.timer);
    this.timer = undefined;
  }

  private clearReconnect() {
    if (this.reconnectTimer !== undefined) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
  }
}
