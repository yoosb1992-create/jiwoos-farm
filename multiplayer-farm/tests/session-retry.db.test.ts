import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { PostgresStore, tokenHash } from "../persistence/store.js";

test("PostgreSQL first-join retries are atomic and survive a new server/store connection", async () => {
  assert.ok(process.env.DATABASE_URL, "Disposable CI PostgreSQL is required");
  const db = new PostgresStore(process.env.DATABASE_URL);
  try {
    await db.migrate();
    const owner = await db.login(true, "", "Retry owner"), token = randomBytes(32).toString("hex");
    const retry = () => db.login(false, owner.farmId, "Retry guest", undefined, undefined, token);
    const [one, two, three] = await Promise.all([retry(), retry(), retry()]);
    assert.deepEqual(one, two); assert.deepEqual(one, three);
    const members = await db.pool.query("SELECT id FROM members WHERE farm_id=$1 AND nickname=$2", [owner.farmId, "Retry guest"]);
    assert.equal(members.rowCount, 1);
    const sessions = await db.pool.query("SELECT token_hash FROM sessions WHERE member_id=$1", [one.playerId]);
    assert.deepEqual(sessions.rows, [{ token_hash: tokenHash(token) }]);
    const restarted = new PostgresStore(process.env.DATABASE_URL);
    try { assert.deepEqual(await restarted.login(false, owner.farmId, "Retry guest", undefined, undefined, token), one); }
    finally { await restarted.close(); }
    await assert.rejects(db.login(false, owner.farmId, "Another name", undefined, undefined, token), /세션/);
  } finally { await db.close(); }
});
