import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const databaseName = process.env.JIWOO_STAGING_D1_NAME?.trim();
const confirmation = process.env.JIWOO_STAGING_CONFIRM?.trim();

if (!databaseName) throw new Error("JIWOO_STAGING_D1_NAME is required.");
if (confirmation !== "INIT_NEW_STAGING_DB") {
  throw new Error("Set JIWOO_STAGING_CONFIRM=INIT_NEW_STAGING_DB to initialize a NEW staging D1 database.");
}
if (!/staging/i.test(databaseName)) {
  throw new Error("Refusing to initialize a D1 database whose name does not include 'staging'.");
}

const wrangler = resolve("node_modules/wrangler/bin/wrangler.js");
const files = readdirSync(resolve("drizzle"))
  .filter((name) => /^\d+.*\.sql$/.test(name))
  .sort();

if (!files.length) throw new Error("No drizzle SQL migrations found.");

for (const file of files) {
  const path = resolve("drizzle", file);
  console.log("Applying", file, "to", databaseName);
  const result = spawnSync(
    process.execPath,
    [wrangler, "d1", "execute", databaseName, "--remote", "--file", path],
    { stdio: "inherit" },
  );
  if (result.status !== 0) {
    throw new Error("D1 initialization failed at " + file + ".");
  }
}

console.log("Staging D1 initialized:", databaseName);
