import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const sourcePath = resolve("dist/server/wrangler.json");
const targetPath = resolve("dist/server/wrangler.staging.json");
const databaseId = process.env.JIWOO_STAGING_D1_ID?.trim();
const databaseName = process.env.JIWOO_STAGING_D1_NAME?.trim();
const workerName = process.env.JIWOO_STAGING_WORKER_NAME?.trim() || "jiwoos-farm-staging";

if (!databaseId || !databaseName) {
  throw new Error("JIWOO_STAGING_D1_ID and JIWOO_STAGING_D1_NAME are required.");
}

const config = JSON.parse(await readFile(sourcePath, "utf8"));
config.name = workerName;
config.workers_dev = true;

const d1 = Array.isArray(config.d1_databases) ? config.d1_databases : [];
const index = d1.findIndex((entry) => entry?.binding === "DB");
const binding = {
  binding: "DB",
  database_name: databaseName,
  database_id: databaseId,
};
if (index >= 0) d1[index] = { ...d1[index], ...binding };
else d1.push(binding);
config.d1_databases = d1;

const durableBindings = config.durable_objects?.bindings;
if (!Array.isArray(durableBindings) || !durableBindings.some((entry) => entry?.name === "FAMILY_ROOM")) {
  throw new Error("Built Wrangler config is missing FAMILY_ROOM Durable Object binding. Refusing staging deploy.");
}

await writeFile(targetPath, JSON.stringify(config, null, 2) + "\n", "utf8");
console.log("Prepared", targetPath, "for", workerName, "with staging D1", databaseName);
