import { strict as assert } from "node:assert";
import { FamilyClient, currentFamilyRealtimeMode, familyPresenceDelay, familyRetryDelay } from "../family/client";
import { Inventory } from "../domain";
import type { FamilySnapshot } from "../family/types";
const originalFetch = globalThis.fetch;
const pending: Array<(response: Response) => void> = [];
const received: number[] = [];
const snapshot = (revision: number): FamilySnapshot => ({ revision, serverNow: revision * 1000, inventory: new Inventory().serialize(), world: { day: 1, timeMinutes: 360, money: 120, farm: [] } });
globalThis.fetch = (async (_url, init) => {
  if (init?.method === "DELETE") return Response.json({ left: true });
  return await new Promise<Response>((resolve) => pending.push(resolve));
}) as typeof fetch;
const client = new FamilyClient({ room: { id: "r", playerId: "p", name: "농장", nickname: "지우", inviteCode: "ABCDEFGH" } }, (s) => received.push(s.revision), () => {});
try {
  assert.deepEqual([0,1,2,3,4,20].map(familyRetryDelay), [1000,2000,4000,8000,16000,16000]);
  assert.equal(familyPresenceDelay({ moving: true }), 90, "moving Family presence stays near-realtime even on D1 fallback");
  assert.equal(familyPresenceDelay({ moving: false }), 450, "idle Family presence backs off without a visible freeze");
  client.start(); // delayed initial GET
  assert.equal(currentFamilyRealtimeMode("r"), "connecting", "transport status is queryable even if the UI subscribes after startup");
  const refresh = client.refresh();
  pending[1](Response.json(snapshot(2))); await refresh;
  pending[0](Response.json(snapshot(1))); await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(received, [2], "late lower revision must not overwrite newer state");
  assert.equal(client.connection, "connected");
  globalThis.fetch = (async () => { throw new Error("secret internal error"); }) as typeof fetch;
  assert.equal(await client.act({ kind: "sell", pose: { mapId: "farm", x: 100, y: 100, facing: "down", moving: false, selectedTool: "hand" } }), false);
  assert.equal(client.connection, "reconnecting");
  globalThis.fetch = (async () => await new Promise<Response>((resolve) => pending.push(resolve))) as typeof fetch;
  const late = client.refresh(); client.stop(); pending[2](Response.json(snapshot(3))); await late;
  assert.deepEqual(received, [2], "destroyed game must not receive callbacks");
  console.log("Family client: stale responses ignored, teardown stops updates");
} finally { client.stop(); globalThis.fetch = originalFetch; }
