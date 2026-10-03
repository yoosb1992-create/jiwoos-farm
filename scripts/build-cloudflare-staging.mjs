import { spawnSync } from "node:child_process";

const databaseId = process.env.JIWOO_D1_DATABASE_ID?.trim();
if (!databaseId) {
  console.error("JIWOO_D1_DATABASE_ID가 필요합니다. 먼저 Cloudflare에 staging D1을 만든 뒤 ID를 넣어 주세요.");
  process.exit(1);
}
process.env.JIWOO_WORKER_NAME ||= "jiwoos-farm-staging";
const result = spawnSync(process.execPath, ["scripts/run-framework.mjs", "build"], {
  stdio: "inherit",
  env: process.env,
});
process.exit(result.status ?? 1);
