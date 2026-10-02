import { strict as assert } from "node:assert";
import { browserFamilyPresenceUrl, realtimePresenceReconnectDelay, WebSocketFamilyRealtimePresence } from "../family/realtimePresence";
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

assert.equal(browserFamilyPresenceUrl({ roomId: "family room", sessionId: "session/1" }), "ws://localhost/api/family/presence/socket?roomId=family%20room&sessionId=session%2F1");
assert.equal(realtimePresenceReconnectDelay(0, 300), 300);
assert.equal(realtimePresenceReconnectDelay(10, 300), 5000);

const pose: FamilyPose = { mapId: "farm", x: 120, y: 180, facing: "right", moving: true, selectedTool: "hand" };
const socket = new FakeSocket();
let openedUrl = "";
const snapshots: FamilyPresenceSnapshot[] = [];
let disconnects = 0;
const channel = new WebSocketFamilyRealtimePresence(
  ({ roomId, sessionId }) => `wss://presence.test/${roomId}?session=${sessionId}`,
  (url) => { openedUrl = url; return socket; },
  60_000,
);
channel.start({
  roomId: "room-a",
  sessionId: "session-a",
  pose: () => pose,
  onSnapshot: (snapshot) => snapshots.push(snapshot),
  onDisconnect: () => { disconnects++; },
});
assert.equal(openedUrl, "wss://presence.test/room-a?session=session-a");
socket.emitOpen();
assert.equal(socket.sent.length, 1, "realtime presence sends immediately after WebSocket open");
assert.deepEqual(JSON.parse(socket.sent[0]), { type: "presence", roomId: "room-a", sessionId: "session-a", pose });
socket.emitMessage(JSON.stringify({ players: [], serverNow: 1234 }));
assert.deepEqual(snapshots, [{ players: [], serverNow: 1234 }]);
socket.emitMessage("not json");
assert.equal(snapshots.length, 1, "malformed frames are ignored");
channel.stop();
assert.equal(socket.closed, true);
assert.equal(socket.closeCode, 1000);
socket.emitClose();
assert.equal(disconnects, 0, "intentional stop must not report a disconnect");

const dropped = new FakeSocket();
const fallback = new WebSocketFamilyRealtimePresence(() => "wss://presence.test/drop", () => dropped, 60_000, 60_000);
fallback.start({ roomId: "room-a", sessionId: "session-b", pose: () => pose, onSnapshot: () => {}, onDisconnect: () => { disconnects++; } });
dropped.emitOpen();
dropped.emitClose();
assert.equal(disconnects, 1, "unexpected close reports a realtime disconnect so D1 fallback can continue");
fallback.stop();

console.log("Family realtime presence: injectable WebSocket movement channel contract passed");
