import test from "node:test";
import assert from "node:assert/strict";
import { MemoryTestStore } from "../persistence/memory-test-store.js";
import { createFarmServer } from "../server/createFarmServer.js";

test("owner deletes a saved farm with explicit yes confirmation, never a typed family code", async () => {
  const store = new MemoryTestStore();
  const server = createFarmServer({ store, host: "127.0.0.1", port: 0 });
  const { url } = await server.listen();
  const endpoint = url.replace(/^ws/, "http") + "/api/farm";
  try {
    const owner = await store.login(true, "", "Delete owner");
    const guest = await store.login(false, owner.farmId, "Delete guest");
    const remove = (token: string, body: unknown) => fetch(endpoint, {
      method: "DELETE",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    assert.equal((await remove(owner.token, {})).status, 400,
      "A DELETE without explicit boolean confirmation must be rejected");
    assert.equal((await remove(owner.token, { confirmFarmId: owner.farmId })).status, 400,
      "Old typed-code-only requests should not bypass the confirmation contract");
    assert.equal((await remove(guest.token, { confirm: true })).status, 400,
      "Other family members cannot delete a farm");
    assert.equal((await remove(owner.token, { confirm: true })).status, 204);
    await assert.rejects(() => store.authenticate(owner.token));
    await assert.rejects(() => store.authenticate(guest.token));
    await assert.rejects(() => store.login(false, owner.farmId, "Gone"));
  } finally {
    await server.close();
  }
});
