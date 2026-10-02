import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";

const route = readFileSync(new URL("../../app/api/family/presence/socket/route.ts", import.meta.url), "utf8");
const scene = readFileSync(new URL("../FarmScene.ts", import.meta.url), "utf8");
const client = readFileSync(new URL("../family/client.ts", import.meta.url), "utf8");

for (const token of ["WebSocketPair", "requireMember", "parseFamilyPose", "broadcast(roomId)", "status: 101"]) {
  assert.ok(route.includes(token), `realtime route keeps ${token}`);
}
assert.ok(route.includes("D1 stays authoritative"), "realtime route documents the transient/persistent split");
assert.ok(scene.includes("new WebSocketFamilyRealtimePresence(browserFamilyPresenceUrl)"), "Family gameplay installs the realtime movement channel");
assert.ok(client.includes("FAMILY_PRESENCE_KEEPALIVE_MS = 1500"), "D1 presence remains a low-rate safety fallback");
assert.ok(client.includes("FAMILY_STATE_POLL_MS = 1000"), "authoritative world-state polling remains independent from movement frames");

console.log("Family realtime route: authenticated WebSocket fast path with D1 fallback wiring passed");
