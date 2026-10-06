import { createFarmServer } from "../server/createFarmServer.js";
import { makeStore } from "./helpers.js";
const server = createFarmServer({
  store: makeStore(),
  port: 2575,
  host: "127.0.0.1",
  production: process.env.FARM_PRODUCTION_TEST === "1",
  clientOrigins: ["http://127.0.0.1:5175", "http://127.0.0.1:4175"],
});
await server.listen();
for (const signal of ["SIGINT", "SIGTERM"])
  process.once(signal, () => {
    void server.close().then(() => process.exit(0));
  });
