import assert from "node:assert/strict";
import { assertPublicBundleText } from "../build/endpoint.js";
import { randomBytes } from "node:crypto";
import { Client, CloseCode } from "@colyseus/sdk";
import { FarmState } from "../shared/schema.js";
import { join, action, move, until, delay, type TestRoom } from "./helpers.js";
import type { Session } from "../persistence/store.js";
import type { Member } from "../shared/world.js";

const backend = new URL(process.env.PUBLIC_FARM_BACKEND ?? "");
const frontend = new URL(process.env.PUBLIC_FARM_FRONTEND ?? "");
for (const url of [backend, frontend]) {
  assert.equal(url.protocol, "https:");
  assert.ok(
    url.hostname.endsWith(".up.railway.app"),
    "Only the isolated Railway deployment may be tested",
  );
  assert.ok(
    ![
      "backend-production-a9e97.up.railway.app",
      "frontend-production-768e.up.railway.app",
    ].includes(url.hostname),
    "Golden Lab is forbidden",
  );
}
const healthResponse = await fetch(new URL("/healthz", backend));
assert.equal(healthResponse.status, 200);
const health = (await healthResponse.json()) as Record<string, unknown>;
assert.equal(health.service, "jiwoos-farm-v2.6");
assert.equal(health.storageNamespace, "farm_v26");
assert.equal(health.database, true);
assert.equal(health.latencyMs, 0);
const page = await fetch(frontend);
assert.equal(page.status, 200);
const html = await page.text();
assert.ok(html.includes("지우네 농장"));
const scripts = [...html.matchAll(/(?:src|href)="([^"]+\.js)"/g)].map(
  (m) => m[1]!,
);
assert.ok(scripts.length > 0);
let endpointFound = false;
for (const path of new Set(scripts)) {
  const response = await fetch(new URL(path, frontend));
  assert.equal(response.status, 200);
  const bundle = await response.text();
  endpointFound ||= bundle.includes(backend.hostname);
  assertPublicBundleText(bundle, path);
}
assert.ok(
  endpointFound,
  "Public WSS endpoint must be present in the loaded module graph",
);
async function session(nickname: string, code = ""): Promise<Session> {
  const response = await fetch(new URL("/api/session", backend), {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: frontend.origin },
    body: JSON.stringify({ create: !code, code, nickname }),
  });
  assert.equal(response.status, 200);
  return (await response.json()) as Session;
}
const a = await session("Public A"),
  b = await session("Public B", a.farmId),
  c = await session("Public C", a.farmId);
const ws = backend.href.replace("https:", "wss:");
let A = await join(ws, a);
const B = await join(ws, b),
  C = await join(ws, c);
const rooms: TestRoom[] = [A, B, C];
let personal: Member | undefined;
function observe(room: TestRoom) {
  room.onMessage("personal", (p: { member: Member }) => (personal = p.member));
  room.send("personal");
}
observe(A);
const started = performance.now();
let patches = 0;
const intervals: number[] = [];
let last = started;
B.onStateChange(() => {
  const now = performance.now();
  intervals.push(now - last);
  last = now;
  patches++;
});
try {
  await until(() => C.state.players.size === 3, 15000);
  const startX = A.state.players.get(A.sessionId)!.x;
  await Promise.all([move(A, 1, 0, 15), move(B, 0, 1, 6)]);
  await move(A, 0, 1, 1);
  await until(() => B.state.players.get(A.sessionId)!.x > startX, 15000);
  assert.equal(
    A.state.players.get(A.sessionId)!.x,
    C.state.players.get(A.sessionId)!.x,
  );
  assert.ok((await action(A, "tillTile")).ok);
  await delay(250);
  assert.ok((await action(A, "plantSeed", { itemId: "sproutberry_seed" })).ok);
  await delay(250);
  assert.ok((await action(A, "waterCrop")).ok);
  await until(() =>
    [...C.state.entities.values()].some((e) => e.kind === "crop" && e.watered),
  );
  await until(() => personal?.inventory.sproutberry_seed === 11);
  const id = A.sessionId,
    token = A.reconnectionToken;
  A.connection.close(CloseCode.MAY_TRY_RECONNECT, "public smoke");
  await until(() => !B.state.players.get(id)?.connected, 15000);
  A = await new Client(ws).reconnect<FarmState>(token, FarmState);
  A.reconnection.enabled = false;
  A.onMessage("actionResult", () => undefined);
  observe(A);
  rooms.push(A);
  await until(() => B.state.players.get(id)?.connected === true, 15000);
  await Promise.all([A.leave(), B.leave(), C.leave()]);
  await delay(2000); // Empty room disposes; subsequent authority loads the committed PostgreSQL world.
  A = await join(ws, a);
  rooms.push(A);
  personal = undefined;
  observe(A);
  await until(() => personal?.inventory.sproutberry_seed === 11, 15000);
  assert.ok(
    [...A.state.entities.values()].some((e) => e.kind === "crop" && e.watered),
  );
  let processRestart = false;
  if (process.env.PUBLIC_WAIT_FOR_RESTART === "1") {
    const beforeRestart = (await (
      await fetch(new URL("/healthz", backend))
    ).json()) as { uptimeSeconds: number };
    const bootAt = Date.now() - beforeRestart.uptimeSeconds * 1000;
    console.log(
      "RESTART READY: disposable farm is committed; restart only the v2.6 Backend in Railway.",
    );
    const deadline = Date.now() + 300000;
    while (Date.now() < deadline) {
      await delay(1000);
      try {
        const response = await fetch(new URL("/healthz", backend), {
          signal: AbortSignal.timeout(5000),
        });
        if (!response.ok) continue;
        const current = (await response.json()) as { uptimeSeconds: number };
        if (Date.now() - current.uptimeSeconds * 1000 > bootAt + 5000) {
          processRestart = true;
          break;
        }
      } catch {
        /* Expected connection interruption during the requested restart. */
      }
    }
    assert.ok(
      processRestart,
      "No actual Backend process restart was observed within five minutes",
    );
    let restored: TestRoom | undefined;
    for (let attempt = 0; attempt < 20 && !restored; attempt++) {
      try {
        restored = await join(ws, a);
      } catch {
        await delay(1000);
      }
    }
    assert.ok(
      restored,
      "Server must restore the persisted family after process restart",
    );
    A = restored;
    rooms.push(A);
    personal = undefined;
    observe(A);
    await until(() => personal?.inventory.sproutberry_seed === 11, 15000);
    assert.ok(
      [...A.state.entities.values()].some(
        (e) => e.kind === "crop" && e.watered,
      ),
    );
  }
  intervals.sort((x, y) => x - y);
  console.log(
    JSON.stringify({
      https: true,
      wss: true,
      clients: 3,
      movement: true,
      convergence: true,
      farming: true,
      reconnect: true,
      postgresReload: true,
      processRestart,
      observedPatchHz: +(patches / ((last - started) / 1000)).toFixed(1),
      patchGapP95Ms: +(
        intervals[Math.floor(intervals.length * 0.95)] ?? 0
      ).toFixed(1),
      farmId: a.farmId,
    }),
  );
} finally {
  await Promise.all(
    rooms.map((r) => (r.connection.isOpen ? r.leave() : Promise.resolve())),
  );
}
