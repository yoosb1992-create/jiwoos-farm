import test from "node:test";
import assert from "node:assert/strict";
import type { Session } from "../persistence/store.js";
import { MemoryTestStore } from "../persistence/memory-test-store.js";
import { createFarmServer } from "../server/createFarmServer.js";

test("creating a farm with a lobby name persists it for the owner and new family members", async () => {
  const store = new MemoryTestStore();
  const server = createFarmServer({ store, host: "127.0.0.1", port: 0 });
  const { url } = await server.listen();
  const endpoint = url.replace(/^ws/, "http") + "/api/session";
  const post = async (body: Record<string, unknown>) => {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() as Session & { error?: string } };
  };
  try {
    const owner = await post({ create: true, code: "", nickname: "지우", farmName: "  우리 가족 텃밭  " });
    assert.equal(owner.status, 200);
    assert.equal(owner.body.farmName, "우리 가족 텃밭");
    assert.equal((await store.authenticate(owner.body.token)).farmName, "우리 가족 텃밭");

    const guest = await post({ create: false, code: owner.body.farmId, nickname: "가족" });
    assert.equal(guest.status, 200);
    assert.equal(guest.body.farmName, "우리 가족 텃밭");
    assert.equal(guest.body.isOwner, false);

    const defaultName = await post({ create: true, code: "", nickname: "기존 호환" });
    assert.equal(defaultName.status, 200);
    assert.equal(defaultName.body.farmName, "기존 호환의 농장");

    const blankName = await post({ create: true, code: "", nickname: "비워 둠", farmName: "" });
    assert.equal(blankName.status, 200);
    assert.equal(blankName.body.farmName, "비워 둠의 농장");

    for (const invalid of ["   ", "가".repeat(31), "잘못된\u0001이름"]) {
      const rejected = await post({ create: true, code: "", nickname: "검증", farmName: invalid });
      assert.equal(rejected.status, 400);
      assert.match(rejected.body.error ?? "", /농장 이름/);
    }
  } finally {
    await server.close();
  }
});
