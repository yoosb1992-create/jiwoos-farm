import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PostgresStore, tokenHash } from "../persistence/store.js";
import { defaultLayout } from "../shared/layout.js";
import { newMember } from "../shared/world.js";
const url = process.env.DATABASE_URL;
test("PostgreSQL migration idempotency, transaction rollback, durable idempotency and session hashing", async () => {
  assert.ok(
    url,
    "DATABASE_URL is required for real PostgreSQL tests; never report a memory fixture as DB validation",
  );
  const db = new PostgresStore(url);
  // Disposable CI database only: a v2.5-shaped namespace must never be selected
  // or migrated by the v2.6 runtime, even when it has a table with the same name.
  const marker = randomUUID();
  await db.pool.query(
    "CREATE TABLE IF NOT EXISTS public.farms(id text PRIMARY KEY, legacy_marker text NOT NULL)",
  );
  await db.pool.query(
    "INSERT INTO public.farms(id,legacy_marker) VALUES($1,$1)",
    [marker],
  );
  try {
    await Promise.all([db.migrate(), db.migrate()]);
    const schema = await db.pool.query("SELECT current_schema() AS name");
    assert.equal(schema.rows[0].name, "farm_v26");
    const legacy = await db.pool.query(
      "SELECT legacy_marker FROM public.farms WHERE id=$1",
      [marker],
    );
    assert.equal(legacy.rows[0].legacy_marker, marker);
    const columns = await db.pool.query(
      "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='farms' ORDER BY ordinal_position",
    );
    assert.deepEqual(
      columns.rows.map((r) => r.column_name),
      ["id", "legacy_marker"],
    );
    const s = await db.login(true, "", "DB-" + randomUUID().slice(0, 6));
    assert.equal((await db.authenticate(s.token)).playerId, s.playerId);
    const secrets = await db.pool.query(
      "SELECT password_hash FROM farms WHERE id=$1",
      [s.farmId],
    );
    assert.equal(secrets.rows[0].password_hash, "disabled:code-only");
    await db.pool.query("UPDATE farms SET password_hash=$2 WHERE id=$1", [
      s.farmId,
      "scrypt:legacy:ignored",
    ]);
    assert.equal(
      (await db.login(false, s.farmId, "Code only peer")).farmId,
      s.farmId,
    );
    const layout = defaultLayout();
    layout.maps.farm!.width = 136;
    const draft = await db.createBlueprint(layout);
    await assert.rejects(() =>
      db.saveBlueprint(draft.id, "invalid", layout, 0, true),
    );
    await db.saveBlueprint(draft.id, draft.editToken, layout, 0, true);
    await assert.rejects(() =>
      db.saveBlueprint(draft.id, draft.editToken, layout, 0, true),
    );
    const edited = await db.login(true, "", "Blueprint farmer", draft.id);
    const isolated = await db.lease(edited.farmId, () => undefined);
    assert.equal((await isolated.load()).layout!.maps.farm!.width, 136);
    await isolated.close();
    const sessionRows = await db.pool.query(
      "SELECT token_hash FROM sessions WHERE member_id=$1",
      [s.playerId],
    );
    assert.equal(sessionRows.rows[0].token_hash, tokenHash(s.token));
    assert.notEqual(sessionRows.rows[0].token_hash, s.token);
    const lease = await db.lease(s.farmId, () => undefined);
    try {
      const w = await lease.load();
      assert.notEqual(w.layout!.maps.farm!.width, 136);
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
