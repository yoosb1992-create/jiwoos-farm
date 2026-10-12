import test from "node:test";
import assert from "node:assert/strict";
import { matchMaker } from "@colyseus/core";
import { CloseCode } from "@colyseus/sdk";
import { ColyseusAdapter, terminalConnectionError, reconnectDelay } from "../client/network.js";
import { createFarmServer } from "../server/createFarmServer.js";
import { MemoryTestStore } from "../persistence/memory-test-store.js";
import { entity, newMember } from "../shared/world.js";
import { chestInventory } from "../shared/chest-storage.js";
import { until, delay } from "./helpers.js";

async function fixture(grace = 30) {
  const store = new MemoryTestStore(), session = await store.login(true, "", "Reconnect");
  const lease = await store.lease(session.farmId, () => {}), w = await lease.load();
  const member = w.members[session.playerId] = newMember(session.playerId, session.nickname);
  member.inventory.wood = 17; member.toolLevels = { axe: 2, pickaxe: 1 };
  member.carried = { itemId: "storage_chest", mode: "hand", storageKey: "chest:carry", entities: [entity("carry", "farm", "chest", 656, 624, "storage_chest")], position: { area: "farm", x: 656, y: 656, facing: "up" } };
  chestInventory(w, "carry").wood = 5; w.revision++; await lease.save(w, 0); await lease.close();
  const server = createFarmServer({ store, port: 0, host: "127.0.0.1", reconnectionSeconds: grace });
  const { url } = await server.listen(), adapter = new ColyseusAdapter(url);
  return { store, session, server, url, adapter, close: async () => { await adapter.leave(); adapter.dispose(); await server.close(); } };
}
test("initial transient failure recovers once; repeated wake/open signals do not duplicate identity", async t => {
  const f = await fixture();
  try {
    const original = globalThis.fetch; let calls = 0, active = 0, peak = 0;
    t.mock.method(globalThis, "fetch", async (...args: Parameters<typeof fetch>) => {
      active++; peak = Math.max(peak, active);
      try { if (++calls === 1) throw new TypeError("temporary offline"); return await original(...args); } finally { active--; }
    });
    const opening = f.adapter.openFarm(f.session); await until(() => f.adapter.snapshot().status === "reconnecting");
    const repeated = f.adapter.openFarm(f.session); for (let i = 0; i < 8; i++) f.adapter.resumeConnection();
    await Promise.all([opening, repeated]);
    assert.equal(f.adapter.snapshot().status, "connected"); assert.equal(peak, 1); assert.equal(calls, 2);
    assert.equal(f.adapter.personal?.member.id, f.session.playerId); assert.equal(f.adapter.state!.players.size, 1);
  } finally { await f.close(); }
});
test("drop restores session, inventory, upgrades and carried chest; offline actions are not replayed", async () => {
  const f = await fixture();
  try {
    await f.adapter.openFarm(f.session); const before = structuredClone(f.adapter.personal), sid = f.adapter.snapshot().sessionId;
    matchMaker.getLocalRoomById(f.adapter.snapshot().roomId)!.clients.get(sid)!.leave(CloseCode.MAY_TRY_RECONNECT);
    await until(() => f.adapter.snapshot().status === "reconnecting");
    f.adapter.action({ actionId: crypto.randomUUID(), type: "lowerChest" }); for (let i = 0; i < 8; i++) f.adapter.resumeConnection();
    await until(() => f.adapter.snapshot().status === "connected"); assert.equal(f.adapter.snapshot().sessionId, sid);
    assert.deepEqual(f.adapter.personal!.member.inventory, before!.member.inventory);
    assert.deepEqual(f.adapter.personal!.member.toolLevels, before!.member.toolLevels);
    assert.deepEqual(f.adapter.personal!.member.carried, before!.member.carried);
    assert.deepEqual(f.adapter.personal!.chestStores, before!.chestStores); assert.equal(f.adapter.state!.players.size, 1);
  } finally { await f.close(); }
});
test("expired room falls back to saved identity; explicit leave stops recovery", async () => {
  const f = await fixture(0);
  try {
    await f.adapter.openFarm(f.session); const before = structuredClone(f.adapter.personal), oldRoom = f.adapter.snapshot().roomId;
    await matchMaker.getLocalRoomById(oldRoom)!.disconnect(CloseCode.SERVER_SHUTDOWN);
    await until(() => f.adapter.snapshot().status === "reconnecting"); f.adapter.resumeConnection();
    await until(() => f.adapter.snapshot().status === "connected", 8000);
    assert.notEqual(f.adapter.snapshot().roomId, oldRoom); assert.equal(f.adapter.personal!.farmId, f.session.farmId);
    assert.equal(f.adapter.personal!.member.id, f.session.playerId);
    assert.deepEqual(f.adapter.personal!.member.inventory, before!.member.inventory);
    assert.deepEqual(f.adapter.personal!.member.toolLevels, before!.member.toolLevels);
    assert.ok(f.adapter.personal!.member.carried); assert.deepEqual(f.adapter.personal!.chestStores, before!.chestStores);
    matchMaker.getLocalRoomById(f.adapter.snapshot().roomId)!.clients.get(f.adapter.snapshot().sessionId)!.leave(CloseCode.MAY_TRY_RECONNECT);
    await until(() => f.adapter.snapshot().status === "reconnecting"); await f.adapter.leave();
    for (let i = 0; i < 8; i++) f.adapter.resumeConnection(); await delay(1100);
    assert.equal(f.adapter.snapshot().status, "disconnected"); assert.equal(f.adapter.personal, undefined);
  } finally { await f.close(); }
});
test("permanent auth refusal stops retries; backoff remains capped without a retry-count limit", async () => {
  const f = await fixture();
  try {
    const invalid = { ...f.session, token: "invalid" }; await assert.rejects(f.adapter.openFarm(invalid), /Invalid token/);
    assert.equal(f.adapter.snapshot().status, "error"); f.adapter.resumeConnection(); await delay(1100);
    assert.equal(f.adapter.snapshot().status, "error"); assert.equal(invalid.token, "invalid");
    assert.ok(terminalConnectionError({ code: 403 })); assert.ok(!terminalConnectionError({ code: 503, message: "database unavailable" }));
    for (const attempt of [0, 1, 5, 10, 100]) assert.ok(reconnectDelay(attempt) <= 30000);
  } finally { await f.close(); }
});
test("first family join HTTP retries return one member/session", async () => {
  const f = await fixture();
  try {
    const body = JSON.stringify({ create: false, code: f.session.farmId, nickname: "Joining", requestToken: "ab".repeat(32) });
    const send = async () => { const r = await fetch(f.url.replace(/^ws/, "http") + "/api/session", { method: "POST", headers: { "Content-Type": "application/json" }, body }); assert.equal(r.status, 200); return r.json(); };
    const [one, two] = await Promise.all([send(), send()]); assert.deepEqual(one, two);
    assert.equal((await f.store.authenticate(one.token)).playerId, two.playerId);
  } finally { await f.close(); }
});

test("long outage exceeds ten failures, and Android stale-socket resume starts only one recovery", async t => {
  const f = await fixture();
  try {
    const internal = f.adapter as unknown as { client: import("@colyseus/sdk").Client; waitToRetry(g: number): Promise<void>; reconnectAttempt: number; lastStateAt: number };
    const original = internal.client.joinOrCreate.bind(internal.client); let attempts = 0;
    t.mock.method(internal.client, "joinOrCreate", async (...args: Parameters<typeof original>) => {
      if (++attempts <= 12) throw Object.assign(new Error("server restarting"), { code: 503 });
      return original(...args);
    });
    const wait = t.mock.method(internal, "waitToRetry", async () => { internal.reconnectAttempt++; });
    await f.adapter.openFarm(f.session); assert.equal(attempts, 13);
    wait.mock.restore();
    const sid = f.adapter.snapshot().sessionId;
    internal.lastStateAt = Date.now() - 60000;
    for (let i = 0; i < 10; i++) f.adapter.resumeConnection();
    assert.equal(f.adapter.snapshot().status, "reconnecting");
    await until(() => f.adapter.snapshot().status === "connected");
    assert.equal(f.adapter.snapshot().sessionId, sid); assert.equal(f.adapter.state!.players.size, 1);
  } finally { await f.close(); }
});
