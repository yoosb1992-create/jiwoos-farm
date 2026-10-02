import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";

const route = readFileSync(new URL("../../app/api/family/presence/socket/route.ts", import.meta.url), "utf8");
const scene = readFileSync(new URL("../FarmScene.ts", import.meta.url), "utf8");
const client = readFileSync(new URL("../family/client.ts", import.meta.url), "utf8");

for (const token of ["requireMember", "env.FAMILY_ROOM", "idFromName(roomId)", "stub.fetch", "가족농장 실시간 서버가 배포되지 않았습니다."]) {
  assert.ok(route.includes(token), `realtime route keeps ${token}`);
}
assert.ok(!route.includes("WebSocketPair"), "production route has no isolate-local WebSocket broker fallback");
assert.ok(!route.includes("compatibility fast path"), "production movement cannot silently downgrade to an isolate-local room");
assert.ok(route.includes("There is intentionally no"), "route documents the mandatory shared room authority");
assert.ok(scene.includes("new WebSocketFamilyRealtimePresence(browserFamilyPresenceUrl)"), "Family gameplay installs the realtime movement channel");
assert.ok(client.includes("FAMILY_PRESENCE_KEEPALIVE_MS = 1500"), "D1 presence is only a low-rate safety heartbeat while realtime is connected");
assert.ok(client.includes("acceptRealtimePresence") && client.includes("acceptFallbackPresence"), "WebSocket and D1 presence have separate ingestion paths");
assert.ok(client.includes("flushPresence()"), "Family client can push movement-state transitions immediately");
assert.ok(client.includes("overlayFamilyPresenceActions(this.realtimePresenceSnapshot, snapshot)"), "D1 heartbeat can add action visuals without replacing WebSocket positions");
assert.ok(client.includes("this.realtimeConnected ? FAMILY_PRESENCE_KEEPALIVE_MS"), "failed WebSocket reconnects automatically use the faster D1 safety path");
assert.ok(client.includes("FAMILY_STATE_POLL_MS = 1000"), "authoritative world-state polling remains independent from movement frames");

console.log("Family realtime route: mandatory Durable Object room authority with safe D1 outage fallback passed");
