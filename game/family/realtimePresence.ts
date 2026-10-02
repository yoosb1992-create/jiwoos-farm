import type { FamilyRealtimePresenceChannel, FamilyRealtimePresenceContext } from "./client";
import { parseFamilyPose } from "./personal";
import type { FamilyPose, FamilyPresence, FamilyPresenceSnapshot } from "./types";

export const REALTIME_PRESENCE_SEND_MS = 33;
export const REALTIME_PRESENCE_RECONNECT_BASE_MS = 200;
export const REALTIME_PRESENCE_RECONNECT_MAX_MS = 5000;
export const REALTIME_PRESENCE_CONNECT_TIMEOUT_MS = 3500;
export const FAMILY_RTC_DATA_LABEL = "family-movement";
export const FAMILY_RTC_CONFIGURATION: RTCConfiguration = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

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
export type FamilyPeerFactory = (configuration: RTCConfiguration) => RTCPeerConnection;

interface FamilyRtcPeer {
  playerId: string;
  nickname: string;
  connection: RTCPeerConnection;
  channel?: RTCDataChannel;
  pendingIce: RTCIceCandidateInit[];
}

type FamilyRtcRelay = {
  type: "signal";
  fromPlayerId: string;
  fromNickname?: string;
  signal:
    | { kind: "offer" | "answer"; sdp: string }
    | { kind: "ice"; candidate: RTCIceCandidateInit };
};

export const browserFamilyPresenceUrl: FamilyPresenceUrlFactory = ({ roomId, sessionId }) => {
  const location = globalThis.location;
  const protocol = location?.protocol === "https:" ? "wss:" : "ws:";
  const host = location?.host || "localhost";
  return `${protocol}//${host}/api/family/presence/socket?roomId=${encodeURIComponent(roomId)}&sessionId=${encodeURIComponent(sessionId)}`;
};

export const realtimePresenceReconnectDelay = (attempt: number, base = REALTIME_PRESENCE_RECONNECT_BASE_MS) =>
  Math.min(REALTIME_PRESENCE_RECONNECT_MAX_MS, Math.max(50, base) * 2 ** Math.min(5, Math.max(0, attempt)));

export const familyRtcInitiator = (ownPlayerId: string, remotePlayerId: string) =>
  ownPlayerId.localeCompare(remotePlayerId) < 0;

const isSnapshot = (value: unknown): value is FamilyPresenceSnapshot => {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<FamilyPresenceSnapshot>;
  return Array.isArray(candidate.players) && Number.isFinite(candidate.serverNow);
};

const isRtcRelay = (value: unknown): value is FamilyRtcRelay => {
  if (!value || typeof value !== "object") return false;
  const frame = value as Partial<FamilyRtcRelay>;
  if (frame.type !== "signal" || typeof frame.fromPlayerId !== "string" || !frame.signal || typeof frame.signal !== "object") return false;
  const signal = frame.signal as FamilyRtcRelay["signal"];
  return ((signal.kind === "offer" || signal.kind === "answer") && typeof signal.sdp === "string") ||
    (signal.kind === "ice" && !!signal.candidate && typeof signal.candidate === "object");
};

/**
 * Hybrid realtime channel.
 *
 * The Durable Object WebSocket remains the authenticated signaling and fallback
 * path. When browsers can establish a WebRTC DataChannel, movement frames are
 * also sent peer-to-peer as unordered/unreliable game data. P2P movement wins
 * over the server snapshot for that peer; D1 remains authoritative only for
 * persistent gameplay state.
 */
export class WebSocketFamilyRealtimePresence implements FamilyRealtimePresenceChannel {
  private socket?: FamilyPresenceSocket;
  private timer?: ReturnType<typeof setInterval>;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private connectTimer?: ReturnType<typeof setTimeout>;
  private context?: FamilyRealtimePresenceContext;
  private reconnectAttempt = 0;
  private stopped = true;
  private serverSnapshot: FamilyPresenceSnapshot = { players: [], serverNow: 0 };
  private rtcPeers = new Map<string, FamilyRtcPeer>();
  private rtcPoses = new Map<string, FamilyPresence>();

  constructor(
    private readonly url: FamilyPresenceUrlFactory,
    private readonly socketFactory: FamilyPresenceSocketFactory = (value) => new WebSocket(value) as unknown as FamilyPresenceSocket,
    private readonly sendEveryMs = REALTIME_PRESENCE_SEND_MS,
    private readonly reconnectBaseMs = REALTIME_PRESENCE_RECONNECT_BASE_MS,
    private readonly connectTimeoutMs = REALTIME_PRESENCE_CONNECT_TIMEOUT_MS,
    private readonly peerFactory?: FamilyPeerFactory,
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
    this.clearConnectTimer();
    this.closeRtcPeers();
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
    this.clearConnectTimer();
    this.connectTimer = setTimeout(() => {
      if (this.socket !== socket || this.stopped || socket.readyState === 1) return;
      this.socket = undefined;
      try { socket.close(4000, "family realtime connect timeout"); } catch { /* browser may already be closing */ }
      this.closeRtcPeers();
      context.onDisconnect();
      this.scheduleReconnect();
    }, this.connectTimeoutMs);

    const send = () => this.sendCurrent(socket, context);

    socket.addEventListener("open", () => {
      if (this.socket !== socket || this.stopped) return;
      this.reconnectAttempt = 0;
      this.clearConnectTimer();
      context.onConnect();
      context.onTransport?.("websocket");
      send();
      this.clearTimer();
      this.timer = setInterval(send, this.sendEveryMs);
    });
    socket.addEventListener("message", (event) => {
      if (this.socket !== socket || typeof event.data !== "string") return;
      try {
        const parsed: unknown = JSON.parse(event.data);
        if (isSnapshot(parsed)) {
          this.serverSnapshot = parsed;
          this.syncRtcPeers(parsed);
          this.emitCombinedSnapshot();
          return;
        }
        if (isRtcRelay(parsed)) void this.handleRtcRelay(parsed);
      } catch {
        // Malformed signaling/presence frames are ignored; D1 remains safe.
      }
    });
    socket.addEventListener("close", () => {
      if (this.socket !== socket) return;
      this.clearConnectTimer();
      this.clearTimer();
      this.socket = undefined;
      this.closeRtcPeers();
      if (this.stopped) return;
      context.onDisconnect();
      this.scheduleReconnect();
    });
    socket.addEventListener("error", () => {
      // Browser WebSocket implementations normally follow this with "close".
    });
  }

  flush() {
    const socket = this.socket;
    const context = this.context;
    if (!socket || !context || this.stopped) return;
    this.sendCurrent(socket, context);
  }

  private sendCurrent(socket: FamilyPresenceSocket, context: FamilyRealtimePresenceContext) {
    if (this.socket !== socket || socket.readyState !== 1) return;
    const pose = context.pose();
    if (!pose) return;
    socket.send(JSON.stringify({
      type: "presence",
      roomId: context.roomId,
      sessionId: context.sessionId,
      pose,
    }));
    const direct = JSON.stringify({ type: "pose", pose });
    for (const peer of this.rtcPeers.values()) {
      if (peer.channel?.readyState !== "open") continue;
      try { peer.channel.send(direct); } catch { /* WebSocket fallback continues */ }
    }
  }

  private syncRtcPeers(snapshot: FamilyPresenceSnapshot) {
    const context = this.context;
    if (!context) return;
    const visible = new Set<string>();
    for (const player of snapshot.players) {
      if (player.playerId === context.playerId) continue;
      visible.add(player.playerId);
      const peer = this.rtcPeers.get(player.playerId);
      if (peer) {
        peer.nickname = player.nickname;
        continue;
      }
      this.ensureRtcPeer(player.playerId, player.nickname, familyRtcInitiator(context.playerId, player.playerId));
    }
    for (const playerId of this.rtcPeers.keys()) {
      if (!visible.has(playerId)) this.dropRtcPeer(playerId);
    }
  }

  private makePeer(): RTCPeerConnection | null {
    if (this.peerFactory) return this.peerFactory(FAMILY_RTC_CONFIGURATION);
    const Constructor = globalThis.RTCPeerConnection;
    return typeof Constructor === "function" ? new Constructor(FAMILY_RTC_CONFIGURATION) : null;
  }

  private ensureRtcPeer(playerId: string, nickname: string, initiate: boolean) {
    if (this.rtcPeers.has(playerId) || !this.context) return this.rtcPeers.get(playerId);
    const connection = this.makePeer();
    if (!connection) return undefined;
    const peer: FamilyRtcPeer = { playerId, nickname, connection, pendingIce: [] };
    this.rtcPeers.set(playerId, peer);

    connection.onicecandidate = (event) => {
      if (!event.candidate) return;
      this.sendRtcSignal(playerId, { kind: "ice", candidate: event.candidate.toJSON() });
    };
    connection.ondatachannel = (event) => this.attachRtcChannel(peer, event.channel);
    connection.onconnectionstatechange = () => {
      if (connection.connectionState === "failed" || connection.connectionState === "closed") this.dropRtcPeer(playerId);
    };

    if (initiate) {
      const channel = connection.createDataChannel(FAMILY_RTC_DATA_LABEL, { ordered: false, maxRetransmits: 0 });
      this.attachRtcChannel(peer, channel);
      void this.createRtcOffer(peer);
    }
    return peer;
  }

  private attachRtcChannel(peer: FamilyRtcPeer, channel: RTCDataChannel) {
    if (peer.channel && peer.channel !== channel) {
      try { peer.channel.close(); } catch { /* replaced channel */ }
    }
    peer.channel = channel;
    channel.onopen = () => {
      const context = this.context;
      if (!context || this.stopped) return;
      context.onTransport?.("webrtc");
      const pose = context.pose();
      if (pose) {
        try { channel.send(JSON.stringify({ type: "pose", pose })); } catch { /* next tick retries */ }
      }
    };
    channel.onmessage = (event) => this.receiveRtcData(peer, event.data);
    channel.onclose = () => {
      if (peer.channel === channel) peer.channel = undefined;
      this.rtcPoses.delete(peer.playerId);
      this.emitCombinedSnapshot();
      if (!this.hasOpenRtcChannel()) this.context?.onTransport?.("websocket");
    };
    channel.onerror = () => {
      // connectionstatechange/channel close handles the fallback.
    };
  }

  private receiveRtcData(peer: FamilyRtcPeer, raw: unknown) {
    if (typeof raw !== "string") return;
    try {
      const frame = JSON.parse(raw) as { type?: unknown; pose?: unknown };
      if (frame.type !== "pose") return;
      const pose = parseFamilyPose(frame.pose);
      if (!pose) return;
      this.rtcPoses.set(peer.playerId, {
        ...pose,
        playerId: peer.playerId,
        nickname: peer.nickname,
        lastSeen: Date.now(),
      });
      this.emitCombinedSnapshot();
    } catch {
      // Unreliable P2P movement frames may be dropped without recovery.
    }
  }

  private async createRtcOffer(peer: FamilyRtcPeer) {
    try {
      const offer = await peer.connection.createOffer();
      await peer.connection.setLocalDescription(offer);
      if (offer.sdp) this.sendRtcSignal(peer.playerId, { kind: "offer", sdp: offer.sdp });
    } catch {
      this.dropRtcPeer(peer.playerId);
    }
  }

  private async handleRtcRelay(frame: FamilyRtcRelay) {
    const context = this.context;
    if (!context || frame.fromPlayerId === context.playerId) return;
    let peer = this.rtcPeers.get(frame.fromPlayerId);
    if (!peer) peer = this.ensureRtcPeer(frame.fromPlayerId, frame.fromNickname ?? "가족", false);
    if (!peer) return;
    if (frame.fromNickname) peer.nickname = frame.fromNickname;
    try {
      if (frame.signal.kind === "ice") {
        if (peer.connection.remoteDescription) await peer.connection.addIceCandidate(frame.signal.candidate);
        else peer.pendingIce.push(frame.signal.candidate);
        return;
      }
      await peer.connection.setRemoteDescription({ type: frame.signal.kind, sdp: frame.signal.sdp });
      for (const candidate of peer.pendingIce.splice(0)) await peer.connection.addIceCandidate(candidate);
      if (frame.signal.kind === "offer") {
        const answer = await peer.connection.createAnswer();
        await peer.connection.setLocalDescription(answer);
        if (answer.sdp) this.sendRtcSignal(peer.playerId, { kind: "answer", sdp: answer.sdp });
      }
    } catch {
      this.dropRtcPeer(peer.playerId);
    }
  }

  private sendRtcSignal(targetPlayerId: string, signal: FamilyRtcRelay["signal"]) {
    const socket = this.socket;
    const context = this.context;
    if (!socket || socket.readyState !== 1 || !context) return;
    try {
      socket.send(JSON.stringify({
        type: "signal",
        roomId: context.roomId,
        sessionId: context.sessionId,
        targetPlayerId,
        signal,
      }));
    } catch {
      // The WebSocket fallback remains available.
    }
  }

  private emitCombinedSnapshot() {
    const context = this.context;
    if (!context || this.stopped) return;
    const now = Date.now();
    const players = new Map(this.serverSnapshot.players.map((player) => [player.playerId, player]));
    for (const [playerId, direct] of this.rtcPoses) {
      const peer = this.rtcPeers.get(playerId);
      if (peer?.channel?.readyState !== "open") continue;
      players.set(playerId, direct);
    }
    context.onSnapshot({ players: [...players.values()], serverNow: Math.max(this.serverSnapshot.serverNow, now) });
  }

  private hasOpenRtcChannel() {
    for (const peer of this.rtcPeers.values()) if (peer.channel?.readyState === "open") return true;
    return false;
  }

  private dropRtcPeer(playerId: string) {
    const peer = this.rtcPeers.get(playerId);
    if (!peer) return;
    this.rtcPeers.delete(playerId);
    this.rtcPoses.delete(playerId);
    try { peer.channel?.close(); } catch { /* already closed */ }
    try { peer.connection.close(); } catch { /* already closed */ }
    if (!this.hasOpenRtcChannel()) this.context?.onTransport?.("websocket");
  }

  private closeRtcPeers() {
    const peers = [...this.rtcPeers.values()];
    this.rtcPeers.clear();
    this.rtcPoses.clear();
    for (const peer of peers) {
      try { peer.channel?.close(); } catch { /* already closed */ }
      try { peer.connection.close(); } catch { /* already closed */ }
    }
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

  private clearConnectTimer() {
    if (this.connectTimer !== undefined) clearTimeout(this.connectTimer);
    this.connectTimer = undefined;
  }
}
