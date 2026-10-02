import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";

const route = readFileSync(new URL("../../app/api/family/presence/socket/route.ts", import.meta.url), "utf8");
const scene = readFileSync(new URL("../FarmScene.ts", import.meta.url), "utf8");
const client = readFileSync(new URL("../family/client.ts", import.meta.url), "utf8");

for (const token of ["requireMember", "env.FAMILY_ROOM", "idFromName(roomId)", "stub.fetch", "parseFamilyRealtimeFrame", "WebSocketPair", "status: 101"]) {
  assert.ok(route.includes(token), `realtime route keeps ${token}`);
}
assert.ok(route.includes("compatibility fast path"), "route retains an in-process fallback until Durable Object provisioning is available");
assert.ok(scene.includes("new WebSocketFamilyRealtimePresence(browserFamilyPresenceUrl)"), "Family gameplay installs the realtime movement channel");
assert.ok(client.includes("FAMILY_PRESENCE_KEEPALIVE_MS = FAMILY_PRESENCE_IDLE_MS"), "D1 presence remains a fast cross-isolate safety path while realtime runs");
assert.ok(client.includes("FAMILY_STATE_POLL_MS = 1000"), "authoritative world-state polling remains independent from movement frames");

console.log("Family realtime route: authenticated Durable Object preference with safe fallbacks passed");
