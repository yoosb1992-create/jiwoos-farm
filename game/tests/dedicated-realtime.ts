import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { issueDedicatedRealtimeToken, verifyDedicatedRealtimeToken } from "../../realtime-worker/auth";
import { parseDedicatedClientFrame } from "../family/dedicatedProtocol";
import { DedicatedFamilyRealtimePresence, DEDICATED_REALTIME_SEND_MS, type DedicatedRealtimeSocket } from "../family/dedicatedRealtime";
import type { FamilyPose, FamilyPresenceSnapshot } from "../family/types";

const now = Date.now();
const secret = "test-secret-for-jiwoos-farm-realtime-123456";
const token = await issueDedicatedRealtimeToken(secret, {
  roomId: "room-a",
  playerId: "player-a",
  nickname: "지우",
  sessionId: "session-a",
  exp: now + 60_000,
});
const claims = await verifyDedicatedRealtimeToken(secret, token, now);
assert.equal(claims?.roomId, "room-a");
assert.equal(claims?.playerId, "player-a");
assert.equal(await verifyDedicatedRealtimeToken("wrong-secret-for-jiwoos-farm-123456", token, now), null);
assert.equal(await verifyDedicatedRealtimeToken(secret, token, now + 61_000), null);

const parsed = parseDedicatedClientFrame(JSON.stringify({
  t: "pose",
  seq: 8,
  pose: { mapId: "farm", x: 10, y: 20, vx: 145, vy: 0, facing: "right", moving: true, running: false, selectedTool: "hand" },
}));
assert.equal(parsed?.t, "pose");
assert.equal(parsed && parsed.t === "pose" ? parsed.seq : -1, 8);
assert.equal(parseDedicatedClientFrame(JSON.stringify({ t: "pose", seq: -1, pose: {} })), null);
assert.equal(DEDICATED_REALTIME_SEND_MS, 33, "dedicated movement uses a stable 30Hz network cadence");

class FakeSocket implements DedicatedRealtimeSocket {
  readyState = 0;
  sent: string[] = [];
  closed = false;
  private listeners = new Map<string, Array<(event?: { data: unknown }) => void>>();
  send(data: string) { this.sent.push(data); }
  close() { this.closed = true; this.readyState = 3; }
  addEventListener(type: "open" | "message" | "close" | "error", listener: (() => void) | ((event: { data: unknown }) => void)) {
    const list = this.listeners.get(type) ?? [];
    list.push(listener as (event?: { data: unknown }) => void);
    this.listeners.set(type, list);
  }
  emitOpen() { this.readyState = 1; for (const listener of this.listeners.get("open") ?? []) listener(); }
  emitMessage(data: unknown) { for (const listener of this.listeners.get("message") ?? []) listener({ data }); }
  emitClose() { this.readyState = 3; for (const listener of this.listeners.get("close") ?? []) listener(); }
}

const originalFetch = globalThis.fetch;
const socket = new FakeSocket();
let openedUrl = "";
const snapshots: FamilyPresenceSnapshot[] = [];
let connected = 0, disconnected = 0;
const diagnostics: Array<{ rttMs: number; jitterMs: number }> = [];
const pose: FamilyPose = { mapId: "farm", x: 100, y: 120, facing: "right", moving: true, selectedTool: "hand", velocityX: 145, velocityY: 0, running: false };

globalThis.fetch = (async () => Response.json({ socketUrl: "wss://rt.example/connect?token=test", expiresAt: Date.now() + 60_000 })) as typeof fetch;
try {
  const channel = new DedicatedFamilyRealtimePresence((url) => { openedUrl = url; return socket; }, 60_000, 60_000);
  channel.start({
    roomId: "room-a",
    sessionId: "session-a",
    playerId: "player-a",
    nickname: "지우",
    pose: () => pose,
    onSnapshot: (snapshot) => snapshots.push(snapshot),
    onConnect: () => { connected++; },
    onTransport: (transport) => assert.equal(transport, "dedicated"),
    onDiagnostics: (stats) => diagnostics.push(stats),
    onDisconnect: () => { disconnected++; },
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(openedUrl, "wss://rt.example/connect?token=test");
  socket.emitOpen();
  assert.equal(connected, 1);
  assert.ok(socket.sent.some((frame) => JSON.parse(frame).t === "pose"), "open immediately sends the current pose");
  assert.ok(socket.sent.some((frame) => JSON.parse(frame).t === "ping"), "open immediately measures RTT");

  socket.emitMessage(JSON.stringify({
    t: "hello",
    playerId: "player-a",
    peers: [{ playerId: "player-b", nickname: "아빠", seq: 3, pose: { mapId: "farm", x: 140, y: 120, vx: 0, vy: 0, facing: "left", moving: false, running: false, selectedTool: "hand" } }],
  }));
  assert.equal(snapshots.at(-1)?.players.length, 2, "snapshot contains self plus remote peer");
  socket.emitMessage(JSON.stringify({
    t: "pose",
    playerId: "player-b",
    nickname: "아빠",
    seq: 4,
    serverTime: Date.now(),
    pose: { mapId: "farm", x: 150, y: 120, vx: 145, vy: 0, facing: "right", moving: true, running: false, selectedTool: "hand" },
  }));
  assert.equal(snapshots.at(-1)?.players.find((p) => p.playerId === "player-b")?.x, 150);

  const clientTime = Date.now() - 40;
  socket.emitMessage(JSON.stringify({ t: "pong", clientTime, serverTime: Date.now() }));
  assert.ok((diagnostics.at(-1)?.rttMs ?? 0) >= 30, "RTT diagnostics are measured on the direct transport");

  socket.emitClose();
  assert.equal(disconnected, 1);
  assert.equal(snapshots.at(-1)?.players.length, 0, "disconnect clears remote rendering instead of falling back to D1 movement");
  channel.stop();
} finally {
  globalThis.fetch = originalFetch;
}

const workerSource = readFileSync(new URL("../../realtime-worker/worker.ts", import.meta.url), "utf8");
const clientSource = readFileSync(new URL("../family/client.ts", import.meta.url), "utf8");
const sceneSource = readFileSync(new URL("../FarmScene.ts", import.meta.url), "utf8");
const statusSource = readFileSync(new URL("../../app/family/FamilyStatus.tsx", import.meta.url), "utf8");
const stateSource = readFileSync(new URL("../../server/family/state.ts", import.meta.url), "utf8");
const routeSource = readFileSync(new URL("../../app/api/family/realtime/route.ts", import.meta.url), "utf8");

assert.ok(workerSource.includes("verifyDedicatedRealtimeToken") && workerSource.includes("DurableObject"), "dedicated worker authenticates and owns realtime rooms");
assert.ok(!workerSource.includes("D1Database") && !workerSource.includes("family_presence"), "dedicated movement worker has no D1 dependency");
assert.ok(routeSource.includes("FAMILY_REALTIME_URL") && routeSource.includes("FAMILY_REALTIME_SECRET"), "Sites issues short-lived dedicated realtime tickets");
assert.ok(sceneSource.includes("new DedicatedFamilyRealtimePresence()"), "gameplay uses the dedicated transport");
assert.ok(clientSource.includes('FamilyRealtimeMode = "connecting" | "dedicated" | "offline"'), "client has no D1 movement fallback mode");
assert.ok(!clientSource.includes("acceptFallbackPresence"), "D1 heartbeat never feeds remote rendering");
assert.ok(statusSource.includes("RT 실시간") && statusSource.includes("jitter"), "HUD exposes direct transport latency diagnostics");
assert.ok(!stateSource.includes("현재 광산 위치를 동기화한 뒤") && !stateSource.includes("물가의 현재 위치를 동기화한 뒤"), "authoritative actions no longer depend on stale D1 movement presence");
assert.ok(stateSource.includes("const players = [pose];"), "building placement does not read remote D1 movement positions");

console.log("Dedicated multiplayer: signed auth, isolated Worker movement, RTT diagnostics and D1-independent actions passed");
