import "dotenv/config";
import { PostgresStore } from "./store.js";
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const store = new PostgresStore(process.env.DATABASE_URL);
try {
  await store.migrate();
  console.info("Farm PostgreSQL migration complete");
} finally {
  await store.close();
}
