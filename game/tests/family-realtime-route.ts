import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";

const route = readFileSync(new URL("../../app/api/family/presence/socket/route.ts", import.meta.url), "utf8");
const scene = readFileSync(new URL("../FarmScene.ts", import.meta.url), "utf8");
const client = readFileSync(new URL("../family/client.ts", import.meta.url), "utf8");
const realtime = readFileSync(new URL("../family/realtimePresence.ts", import.meta.url), "utf8");
const worker = readFileSync(new URL("../../server/worker.ts", import.meta.url), "utf8");
const direct = readFileSync(new URL("../../server/family/directRealtime.ts", import.meta.url), "utf8");
const ticket = readFileSync(new URL("../../app/api/family/presence/ticket/route.ts", import.meta.url), "utf8");
const rtc = readFileSync(new URL("../../app/api/family/presence/rtc/route.ts", import.meta.url), "utf8");

for (const token of ["requireMember", "env.FAMILY_ROOM", "idFromName(roomId)", "stub.fetch", "가족농장 실시간 서버가 배포되지 않았습니다."]) {
  assert.ok(route.includes(token), `realtime route keeps ${token}`);
}
assert.ok(!route.includes("WebSocketPair"), "production route has no isolate-local WebSocket broker fallback");
assert.ok(!route.includes("compatibility fast path"), "production movement cannot silently downgrade to an isolate-local room");
assert.ok(route.includes("There is intentionally no"), "route documents the mandatory shared room authority");
assert.ok(scene.includes("new WebSocketFamilyRealtimePresence(browserFamilyPresenceUrl)"), "Family gameplay installs the realtime movement channel");
assert.ok(realtime.includes("/family/realtime?roomId="), "browser movement socket bypasses the Next API route and targets the raw Worker endpoint");
assert.ok(realtime.includes("REALTIME_PRESENCE_SEND_MS = 16"), "direct movement continuously streams at roughly 60Hz");
assert.ok(worker.includes("DIRECT_FAMILY_REALTIME_PATH") && worker.includes("handleDirectFamilyRealtime"), "custom Worker intercepts the raw realtime path before vinext");
assert.ok(worker.includes("handler.fetch(request, env, ctx)"), "all non-realtime requests still delegate to vinext");
for (const token of ["x-family-realtime-ticket", "env.FAMILY_ROOM.idFromName(roomId)", "stub.fetch"]) {
  assert.ok(direct.includes(token), `direct realtime entrance keeps ${token}`);
}
assert.ok(!direct.includes("oai-authenticated-user-id") && !direct.includes("requireMember"), "raw WebSocket entrance uses an authenticated one-time ticket instead of browser-inaccessible auth headers");
for (const token of ["familyRequest", "requireMember", "env.FAMILY_ROOM.idFromName(roomId)", "/ticket"]) {
  assert.ok(ticket.includes(token), `authenticated ticket route keeps ${token}`);
}
for (const token of ["familyRequest", "requireMember", "/rtc/signal", "/rtc/poll", "targetPlayerId"]) {
  assert.ok(rtc.includes(token), `authenticated HTTP WebRTC signaling keeps ${token}`);
}
assert.ok(client.includes("FAMILY_PRESENCE_KEEPALIVE_MS = 1500"), "D1 presence is only a low-rate safety heartbeat while realtime is connected");
assert.ok(client.includes("acceptRealtimePresence") && client.includes("acceptFallbackPresence"), "WebSocket and D1 presence have separate ingestion paths");
assert.ok(client.includes("syncPeers") && realtime.includes("syncPeers(snapshot"), "D1 presence can discover WebRTC peers without a WebSocket connection");
assert.ok(client.includes("flushPresence()"), "Family client can push movement-state transitions immediately");
assert.ok(client.includes("/api/family/presence/ticket") && client.includes("getTicket"), "Family client obtains a fresh authenticated realtime ticket for each socket connection");
assert.ok(client.includes("error.status === 409") && client.includes("attempt === 0"), "concurrent Family actions retry once on the latest authoritative revision");
assert.ok(client.includes('"webrtc"') && client.includes("onTransport"), "Family client exposes WebRTC P2P as a distinct realtime transport");
assert.ok(client.includes("overlayFamilyPresenceActions(this.realtimePresenceSnapshot, snapshot)"), "D1 heartbeat can add action visuals without replacing WebSocket positions");
assert.ok(client.includes("this.realtimeConnected ? FAMILY_PRESENCE_KEEPALIVE_MS"), "failed WebSocket reconnects automatically use the faster D1 safety path");
assert.ok(client.includes("FAMILY_STATE_POLL_MS = 1000"), "authoritative world-state polling remains independent from movement frames");

console.log("Family realtime route: mandatory Durable Object room authority with safe D1 outage fallback passed");
