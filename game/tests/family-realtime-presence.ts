import { strict as assert } from "node:assert";
import { FAMILY_RTC_DATA_LABEL, REALTIME_PRESENCE_CONNECT_TIMEOUT_MS, REALTIME_PRESENCE_SEND_MS, browserFamilyPresenceUrl, familyRtcInitiator, realtimePresenceReconnectDelay, WebSocketFamilyRealtimePresence } from "../family/realtimePresence";
import type { FamilyPose, FamilyPresenceSnapshot } from "../family/types";
import type { FamilyPresenceSocket } from "../family/realtimePresence";

class FakeSocket implements FamilyPresenceSocket {
  readyState = 0;
  sent: string[] = [];
  closed = false;
  closeCode?: number;
  closeReason?: string;
  private listeners = new Map<string, Array<(event?: { data: unknown }) => void>>();

  send(data: string) { this.sent.push(data); }
  close(code?: number, reason?: string) {
    this.closed = true; this.closeCode = code; this.closeReason = reason; this.readyState = 3;
  }
  addEventListener(type: "open" | "message" | "close" | "error", listener: (() => void) | ((event: { data: unknown }) => void)) {
    const list = this.listeners.get(type) ?? [];
    list.push(listener as (event?: { data: unknown }) => void);
    this.listeners.set(type, list);
  }
  emitOpen() { this.readyState = 1; for (const listener of this.listeners.get("open") ?? []) listener(); }
  emitMessage(data: unknown) { for (const listener of this.listeners.get("message") ?? []) listener({ data }); }
  emitClose() { this.readyState = 3; for (const listener of this.listeners.get("close") ?? []) listener(); }
}

assert.equal(browserFamilyPresenceUrl({ roomId: "family room", sessionId: "session/1" }, "ticket value"), "ws://localhost/family/realtime?roomId=family%20room&sessionId=session%2F1&ticket=ticket%20value");
assert.equal(REALTIME_PRESENCE_SEND_MS, 16, "direct movement stream targets roughly 60Hz delivery");
assert.equal(REALTIME_PRESENCE_CONNECT_TIMEOUT_MS, 3500, "stuck websocket handshakes cannot remain in connecting forever");
assert.equal(FAMILY_RTC_DATA_LABEL, "family-movement");
assert.equal(familyRtcInitiator("a", "b"), true);
assert.equal(familyRtcInitiator("b", "a"), false);
assert.equal(realtimePresenceReconnectDelay(0, 300), 300);
assert.equal(realtimePresenceReconnectDelay(10, 300), 5000);

const pose: FamilyPose = { mapId: "farm", x: 120, y: 180, facing: "right", moving: true, selectedTool: "hand", velocityX: 145, velocityY: 0, running: false };
const socket = new FakeSocket();
let openedUrl = "";
const snapshots: FamilyPresenceSnapshot[] = [];
let disconnects = 0;
let connects = 0;
const channel = new WebSocketFamilyRealtimePresence(
  ({ roomId, sessionId }) => `wss://presence.test/${roomId}?session=${sessionId}`,
  (url) => { openedUrl = url; return socket; },
  60_000,
);
channel.start({
  roomId: "room-a",
  sessionId: "session-a",
  playerId: "00000000-0000-4000-8000-000000000001",
  nickname: "첫째",
  pose: () => pose,
  onSnapshot: (snapshot) => snapshots.push(snapshot),
  onConnect: () => { connects++; },
  onDisconnect: () => { disconnects++; },
});
assert.equal(openedUrl, "wss://presence.test/room-a?session=session-a");
socket.emitOpen();
assert.equal(connects, 1, "realtime channel reports the authoritative room connection");
assert.equal(socket.sent.length, 1, "realtime presence sends immediately after WebSocket open");
const firstFrame = JSON.parse(socket.sent[0]) as { type:string; roomId:string; sessionId:string; pose:FamilyPose; sequence:number; clientSentAt:number };
assert.equal(firstFrame.type, "presence");
assert.equal(firstFrame.roomId, "room-a");
assert.equal(firstFrame.sessionId, "session-a");
assert.deepEqual(firstFrame.pose, pose);
assert.equal(firstFrame.sequence, 1);
assert.ok(Number.isFinite(firstFrame.clientSentAt));
channel.flush();
assert.equal(socket.sent.length, 2, "movement state changes can flush immediately without waiting for the 30Hz timer");
socket.emitMessage(JSON.stringify({ players: [], serverNow: 1234 }));
assert.equal(snapshots.length, 1);
assert.deepEqual(snapshots[0].players, []);
assert.ok(snapshots[0].serverNow >= 1234, "hybrid snapshot uses a monotonic local/server clock for P2P freshness");
socket.emitMessage("not json");
assert.equal(snapshots.length, 1, "malformed frames are ignored");
channel.stop();
assert.equal(socket.closed, true);
assert.equal(socket.closeCode, 1000);
socket.emitClose();
assert.equal(disconnects, 0, "intentional stop must not report a disconnect");

const dropped = new FakeSocket();
const fallback = new WebSocketFamilyRealtimePresence(() => "wss://presence.test/drop", () => dropped, 60_000, 60_000);
fallback.start({ roomId: "room-a", sessionId: "session-b", playerId: "00000000-0000-4000-8000-000000000001", nickname: "첫째", pose: () => pose, onSnapshot: () => {}, onConnect: () => { connects++; }, onDisconnect: () => { disconnects++; } });
dropped.emitOpen();
dropped.emitClose();
assert.equal(disconnects, 1, "unexpected close reports a realtime disconnect so D1 fallback can continue");
fallback.stop();

const hanging = new FakeSocket();
let watchdogDisconnects = 0;
const watchdog = new WebSocketFamilyRealtimePresence(
  () => "wss://presence.test/hanging",
  () => hanging,
  60_000,
  60_000,
  5,
);
watchdog.start({
  roomId: "room-a",
  sessionId: "session-c",
  playerId: "00000000-0000-4000-8000-000000000001",
  nickname: "첫째",
  pose: () => pose,
  onSnapshot: () => {},
  onConnect: () => {},
  onDisconnect: () => { watchdogDisconnects++; },
});
await new Promise((resolve) => setTimeout(resolve, 15));
assert.equal(hanging.closed, true, "a websocket handshake that never opens is actively closed");
assert.equal(watchdogDisconnects, 1, "connect watchdog switches gameplay to D1 recovery mode");
watchdog.stop();

console.log("Family realtime presence: direct 60Hz socket, sequencing, reconnect and connect-watchdog contract passed");
