import { strict as assert } from "node:assert";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import type { FamilyDB } from "../../server/family/rooms";

/** Real SQLite executes the same migration/SQL as D1; no production binding is used. */
export function familyTestDB() {
  const sqlite = new DatabaseSync(":memory:"); sqlite.exec("PRAGMA foreign_keys = ON");
  const dir = new URL("../../drizzle/", import.meta.url);
  const journal = JSON.parse(readFileSync(new URL("meta/_journal.json", dir), "utf8")) as { entries: { tag: string }[] };
  const migrations = journal.entries.map(entry => `${entry.tag}.sql`);
  assert.deepEqual(migrations, readdirSync(dir).filter(n => /^\d+.*\.sql$/.test(n)).sort(), "every migration must be registered exactly once in deployment order");
  for (const name of migrations) sqlite.exec(readFileSync(new URL(name, dir), "utf8"));
  class Statement {
    private values: SQLInputValue[] = [];
    constructor(private sql: string) {}
    bind(...values: SQLInputValue[]) { this.values = values; return this; }
    async first<T>() { return (sqlite.prepare(this.sql).get(...this.values) as T) ?? null; }
    async all<T>() { return { results: sqlite.prepare(this.sql).all(...this.values) as T[] }; }
    async run() { const result = sqlite.prepare(this.sql).run(...this.values); return { success: true, meta: { changes: Number(result.changes) } }; }
  }
  const db = {
    prepare: (sql: string) => new Statement(sql),
    batch: async (statements: Statement[]) => {
      sqlite.exec("BEGIN");
      try { const results = []; for (const s of statements) results.push(await s.run()); sqlite.exec("COMMIT"); return results; }
      catch (error) { sqlite.exec("ROLLBACK"); throw error; }
    },
  } as unknown as FamilyDB;
  return { db, close: () => sqlite.close() };
}
