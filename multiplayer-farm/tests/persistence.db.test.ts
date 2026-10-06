import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PostgresStore, tokenHash } from "../persistence/store.js";
import { newMember } from "../shared/world.js";
const url = process.env.DATABASE_URL;
test("PostgreSQL migration idempotency, transaction rollback, durable idempotency and session hashing", async () => {
  assert.ok(
    url,
    "DATABASE_URL is required for real PostgreSQL tests; never report a memory fixture as DB validation",
  );
  const db = new PostgresStore(url);
  try {
    await Promise.all([db.migrate(), db.migrate()]);
    const s = await db.login(
      true,
      "",
      "긴 비밀번호".repeat(25),
      "DB-" + randomUUID().slice(0, 6),
    );
    assert.equal((await db.authenticate(s.token)).playerId, s.playerId);
    const secrets = await db.pool.query(
      "SELECT password_hash FROM farms WHERE id=$1",
      [s.farmId],
    );
    assert.ok(secrets.rows[0].password_hash.startsWith("scrypt:"));
    const sessionRows = await db.pool.query(
      "SELECT token_hash FROM sessions WHERE member_id=$1",
      [s.playerId],
    );
    assert.equal(sessionRows.rows[0].token_hash, tokenHash(s.token));
    assert.notEqual(sessionRows.rows[0].token_hash, s.token);
    const lease = await db.lease(s.farmId, () => undefined);
    try {
      const w = await lease.load();
      w.members[s.playerId] = newMember(s.playerId, s.nickname);
      w.revision++;
      await lease.save(w, 0);
      const next = structuredClone(w);
      next.revision++;
      next.chest.wood = 5;
      const receipt = {
        playerId: s.playerId,
        actionId: "db-receipt-001",
        hash: "hash",
        result: {
          actionId: "db-receipt-001",
          ok: true,
          message: "done",
          revision: 2,
        },
      };
      await lease.save(next, 1, receipt);
      const bad = structuredClone(next);
      bad.revision++;
      bad.chest.wood = 999;
      await assert.rejects(() => lease.save(bad, 2, receipt));
      assert.equal((await lease.load()).chest.wood, 5);
      assert.equal(
        (await lease.receipt(s.playerId, "db-receipt-001"))?.result.revision,
        2,
      );
      await assert.rejects(() => db.lease(s.farmId, () => undefined));
    } finally {
      await lease.close();
    }
    const restored = await db.lease(s.farmId, () => undefined);
    try {
      assert.equal((await restored.load()).chest.wood, 5);
    } finally {
      await restored.close();
    }
  } finally {
    await db.close();
  }
});
