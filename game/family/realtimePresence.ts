import type { FamilyRealtimePresenceChannel, FamilyRealtimePresenceContext } from "./client";
import type { FamilyPresenceSnapshot } from "./types";

export const REALTIME_PRESENCE_SEND_MS = 100;

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

const isSnapshot = (value: unknown): value is FamilyPresenceSnapshot => {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<FamilyPresenceSnapshot>;
  return Array.isArray(candidate.players) && Number.isFinite(candidate.serverNow);
};

/** WebSocket transport for the movement/presence plane only.
 *
 * This is deliberately independent from Family state/actions: D1 remains the
 * authoritative persistence layer. The channel is injectable so a Sites/DO
 * endpoint can be provisioned later without rewriting FamilyClient.
 */
export class WebSocketFamilyRealtimePresence implements FamilyRealtimePresenceChannel {
  private socket?: FamilyPresenceSocket;
  private timer?: ReturnType<typeof setInterval>;
  private context?: FamilyRealtimePresenceContext;

  constructor(
    private readonly url: FamilyPresenceUrlFactory,
    private readonly socketFactory: FamilyPresenceSocketFactory = (value) => new WebSocket(value) as unknown as FamilyPresenceSocket,
    private readonly sendEveryMs = REALTIME_PRESENCE_SEND_MS,
  ) {}

  start(context: FamilyRealtimePresenceContext) {
    this.stop();
    this.context = context;
    const socket = this.socketFactory(this.url(context));
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
      if (this.socket !== socket) return;
      send();
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
      context.onDisconnect();
    });
    socket.addEventListener("error", () => {
      // Most runtimes follow with close. If not, D1 keepalive still protects
      // online state and the next channel lifecycle can reconnect explicitly.
    });
  }

  stop() {
    const socket = this.socket;
    this.socket = undefined;
    this.context = undefined;
    this.clearTimer();
    if (socket) socket.close(1000, "family presence stopped");
  }

  private clearTimer() {
    if (this.timer !== undefined) clearInterval(this.timer);
    this.timer = undefined;
  }
}
