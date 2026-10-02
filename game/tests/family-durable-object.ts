import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import {
  FAMILY_REALTIME_MAX_FRAME_BYTES,
  FAMILY_REALTIME_SIGNAL_MAX_FRAME_BYTES,
  familyRealtimeSnapshot,
  parseFamilyRealtimeFrame,
  parseFamilyRealtimeSignalFrame,
} from "../../server/family/realtimeProtocol";

const pose = { mapId: "farm", x: 120, y: 180, facing: "right", moving: true, selectedTool: "hand", velocityX: 145, velocityY: 0, running: false } as const;
const valid = JSON.stringify({ type: "presence", roomId: "room-a", sessionId: "session-a", pose });
assert.deepEqual(parseFamilyRealtimeFrame(valid, "room-a", "session-a"), pose);
assert.equal(parseFamilyRealtimeFrame(valid, "room-b", "session-a"), null);
assert.equal(parseFamilyRealtimeFrame(valid, "room-a", "session-b"), null);
assert.equal(parseFamilyRealtimeFrame(JSON.stringify({ type: "presence", roomId: "room-a", sessionId: "session-a", pose: { ...pose, velocityX: 9999 } }), "room-a", "session-a"), null, "invalid movement speeds are rejected");
assert.equal(parseFamilyRealtimeFrame("x".repeat(FAMILY_REALTIME_MAX_FRAME_BYTES + 1), "room-a", "session-a"), null);
const rtcTarget = "00000000-0000-4000-8000-000000000002";
const offerFrame = JSON.stringify({ type: "signal", roomId: "room-a", sessionId: "session-a", targetPlayerId: rtcTarget, signal: { kind: "offer", sdp: "v=0\\r\\n" } });
assert.deepEqual(parseFamilyRealtimeSignalFrame(offerFrame, "room-a", "session-a"), { targetPlayerId: rtcTarget, signal: { kind: "offer", sdp: "v=0\\r\\n" } });
assert.equal(parseFamilyRealtimeSignalFrame(JSON.stringify({ type: "signal", roomId: "room-a", sessionId: "session-a", targetPlayerId: "bad", signal: { kind: "offer", sdp: "v=0" } }), "room-a", "session-a"), null);
assert.equal(parseFamilyRealtimeSignalFrame("x".repeat(FAMILY_REALTIME_SIGNAL_MAX_FRAME_BYTES + 1), "room-a", "session-a"), null);

const snapshot = familyRealtimeSnapshot([
  { roomId: "room-a", sessionId: "a", playerId: "p1", nickname: "첫째", pose, lastSeen: 100 },
  { roomId: "room-a", sessionId: "b", playerId: "p1", nickname: "첫째", pose: { ...pose, x: 300 }, lastSeen: 200 },
  { roomId: "room-a", sessionId: "c", playerId: "p2", nickname: "둘째", pose: { ...pose, x: 40 }, lastSeen: 150 },
], 999);
assert.equal(snapshot.serverNow, 999);
assert.equal(snapshot.players.length, 2);
assert.equal(snapshot.players.find((player) => player.playerId === "p1")?.x, 300, "latest session pose wins for the same player");

const durableSource = readFileSync(new URL("../../server/family/FamilyRoomDurableObject.ts", import.meta.url), "utf8");
const routeSource = readFileSync(new URL("../../app/api/family/presence/socket/route.ts", import.meta.url), "utf8");
const workerSource = readFileSync(new URL("../../server/worker.ts", import.meta.url), "utf8");
const envSource = readFileSync(new URL("../../cloudflare-env.d.ts", import.meta.url), "utf8");
const viteSource = readFileSync(new URL("../../vite.config.ts", import.meta.url), "utf8");
const realtimeSource = readFileSync(new URL("../family/realtimePresence.ts", import.meta.url), "utf8");

for (const token of ["extends DurableObject", "acceptWebSocket", "serializeAttachment", "deserializeAttachment", "getWebSockets", "webSocketMessage", "parseFamilyRealtimeSignalFrame", 'url.pathname === "/ticket"', "realtime-ticket:", "x-family-realtime-ticket"]) {
  assert.ok(durableSource.includes(token), `Durable Object implements ${token}`);
}
assert.ok(routeSource.includes("env.FAMILY_ROOM.idFromName(roomId)"), "socket route selects one Durable Object identity per Family room");
assert.ok(routeSource.includes("stub.fetch"), "socket route proxies the upgraded connection into the Durable Object");
assert.ok(workerSource.includes("FamilyRoomDurableObject"), "custom worker entry exports the Durable Object class");
assert.ok(envSource.includes("FAMILY_ROOM: DurableObjectNamespace"), "Cloudflare env requires the Family room namespace binding");
assert.ok(viteSource.includes('main: "./server/worker.ts"'), "vinext build uses the custom worker entry while preserving its default handler");
assert.ok(viteSource.includes('name: "FAMILY_ROOM"') && viteSource.includes('class_name: "FamilyRoomDurableObject"'), "worker config binds FAMILY_ROOM to the room Durable Object");
assert.ok(viteSource.includes('type: "durable-object"') && viteSource.includes('storage: "sqlite"'), "worker config provisions the Durable Object with SQLite storage");
assert.ok(durableSource.includes("getWebSockets(signal.targetPlayerId)"), "Durable Object relays WebRTC signaling only to the target family player");
assert.ok(durableSource.includes("this.ctx.storage.put") && durableSource.includes("this.ctx.storage.delete"), "realtime tickets are short-lived Durable Object state and are consumed on connect");
assert.ok(realtimeSource.includes("RTCPeerConnection") && realtimeSource.includes("createDataChannel"), "browser realtime channel attempts a direct WebRTC peer connection");
assert.ok(realtimeSource.includes("ordered: false") && realtimeSource.includes("maxRetransmits: 0"), "P2P movement uses unordered unretransmitted game data");

console.log("Family Durable Object: room authority, WebRTC signaling and fallback wiring passed");
