import "dotenv/config";
import { createFarmServer } from "./createFarmServer.js";

import { PostgresStore } from "../persistence/store.js";
if (!process.env.DATABASE_URL)
  throw new Error(
    "DATABASE_URL is required; production never falls back to volatile storage",
  );
const store = new PostgresStore(process.env.DATABASE_URL);
const port = Number(process.env.PORT || 2567);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error("PORT must be 1..65535.");
const lab = createFarmServer({
  store,
  port,
  host: process.env.HOST || "0.0.0.0",
  clientOrigins: (process.env.CLIENT_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
  latencyMs: Number(process.env.LAB_LATENCY_MS || 0),
});

let stopping = false;
async function shutdown(signal: string): Promise<void> {
  if (stopping) return;
  stopping = true;
  console.info(`[farm] ${signal}: closing rooms and WebSockets`);
  const deadline = setTimeout(() => process.exit(1), 10_000);
  deadline.unref();
  try {
    await lab.close();
    process.exitCode = 0;
  } catch (error) {
    console.error("[farm] shutdown failed", error);
    process.exitCode = 1;
  } finally {
    clearTimeout(deadline);
  }
}
process.once("SIGINT", () => {
  void shutdown("SIGINT");
});
process.once("SIGTERM", () => {
  void shutdown("SIGTERM");
});

try {
  const address = await lab.listen();
  console.info(`[farm] listening at ${address.url}; health /healthz`);
} catch (error) {
  console.error("[farm] startup failed", error);
  await lab.close();
  process.exitCode = 1;
}
