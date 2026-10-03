import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";

if (!process.argv.includes("--fresh")) {
  console.error("이 명령은 새 staging D1 전용입니다. 실행하려면: npm run staging:schema -- --fresh");
  process.exit(1);
}
const files = readdirSync("drizzle").filter((name) => /^\d+_.*\.sql$/.test(name)).sort();
for (const file of files) {
  console.log(`[staging schema] ${file}`);
  const result = spawnSync(process.execPath, [
    "./node_modules/wrangler/bin/wrangler.js",
    "d1", "execute", "DB", "--remote",
    "--config", "dist/server/wrangler.json",
    "--file", `drizzle/${file}`,
  ], { stdio: "inherit", env: process.env });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
