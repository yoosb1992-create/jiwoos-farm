import { blueprintRoutes } from "./blueprintRoutes.js";
import { createServer } from "node:http";
import { Server, createRouter } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import {
  RECONNECTION_SECONDS,
  ROOM_NAME,
  SERVER_TICK_RATE,
  PATCH_RATE,
} from "../shared/config.js";
import { configuredFarmRoom } from "./FarmRoom.js";
import express from "express";
import type { Store } from "../persistence/store.js";

export interface FarmServerOptions {
  store: Store;
  port?: number;
  host?: string;
  clientOrigins?: readonly string[];
  reconnectionSeconds?: number;
  /** Added round-trip milliseconds, dev/test only. */
  latencyMs?: number;
  production?: boolean;
}

export function createFarmServer(options: FarmServerOptions) {
  const production =
    options.production ?? process.env.NODE_ENV === "production";
  const latencyMs = production ? 0 : (options.latencyMs ?? 0);
  if (![0, 50, 100, 200].includes(latencyMs)) {
    throw new Error(
      "LAB_LATENCY_MS must be 0, 50, 100 or 200 (added round-trip milliseconds).",
    );
  }
  // Colyseus also recognizes its own latency env during listen(). Prevent a
  // forgotten development variable from silently delaying a production server.
  if (Number(process.env.COLYSEUS_LATENCY || 0) !== 0) {
    throw new Error(
      "COLYSEUS_LATENCY must be unset; use development-only LAB_LATENCY_MS instead.",
    );
  }

  const host = options.host ?? "0.0.0.0";
  const port = options.port ?? 2567;
  const reconnectionSeconds =
    options.reconnectionSeconds ?? RECONNECTION_SECONDS;
  if (
    !Number.isFinite(reconnectionSeconds) ||
    reconnectionSeconds < 0 ||
    reconnectionSeconds > 120
  ) {
    throw new Error("Invalid server-only reconnection grace.");
  }
  const origins = new Set(options.clientOrigins ?? []);
  if (production && origins.size === 0) {
    throw new Error(
      "CLIENT_ORIGINS must list the allowed client origin(s) in production.",
    );
  }
  for (const origin of origins) {
    const parsed = new URL(origin);
    if (
      !["http:", "https:"].includes(parsed.protocol) ||
      parsed.origin !== origin
    ) {
      throw new Error(
        "CLIENT_ORIGINS entries must be exact http(s) origins without a path.",
      );
    }
  }
  const originAllowed = (origin: string | null | undefined): boolean =>
    !origin || origins.size === 0 || origins.has(origin);
  const httpServer = createServer();
  const transport = new WebSocketTransport({
    server: httpServer,
    maxPayload: 4096,
    perMessageDeflate: false,
    beforeUpgrade: (request) => {
      if (!originAllowed(request.headers.get("origin"))) {
        return new Response("Origin not allowed", { status: 403 });
      }
    },
  });
  let closing = false;
  let listening = false;
  let closePromise: Promise<void> | undefined;
  const server = new Server({
    transport,
    gracefullyShutdown: false,
    greet: false,
    express: (app) => {
      app.disable("x-powered-by");
      app.use((request, response, next) => {
        if (!originAllowed(request.headers.origin)) {
          response.status(403).json({ error: "Origin not allowed" });
          return;
        }
        if (request.headers.origin && originAllowed(request.headers.origin))
          response.setHeader(
            "Access-Control-Allow-Origin",
            request.headers.origin,
          );
        response.setHeader("Vary", "Origin");
        response.setHeader(
          "Access-Control-Allow-Headers",
          "Content-Type, Authorization",
        );
        response.setHeader(
          "Access-Control-Allow-Methods",
          "GET, POST, OPTIONS",
        );
        if (request.method === "OPTIONS") {
          response.status(204).end();
          return;
        }
        next();
      });
      blueprintRoutes(app, options.store);
      app.use(express.json({ limit: "8kb" }));
      // Rate-limit session and new farm creation independently of WebSocket inputs.
      const attempts = new Map<string, { count: number; until: number }>();
      app.post("/api/session", async (request, response) => {
        const key =
          request.headers["x-forwarded-for"]
            ?.toString()
            .split(",")
            .at(-1)
            ?.trim() ||
          request.socket.remoteAddress ||
          "unknown";
        const now = Date.now();
        let rate = attempts.get(key);
        if (!rate || rate.until < now) {
          rate = { count: 0, until: now + 60000 };
          attempts.set(key, rate);
        }
        if (attempts.size > 5000)
          for (const [k, v] of attempts) if (v.until < now) attempts.delete(k);
        if (++rate.count > 12) {
          response.status(429).json({ error: "잠시 후 다시 시도하세요" });
          return;
        }
        try {
          const body = request.body as Record<string, unknown>;
          if (!body || typeof body.nickname !== "string")
            throw new Error("입력값을 확인하세요");
          const result = await options.store.login(
            body.create === true,
            typeof body.code === "string" ? body.code : "",
            body.nickname,
            typeof body.templateId === "string" ? body.templateId : undefined,
          );
          response.setHeader("Cache-Control", "no-store");
          response.json(result);
        } catch (error) {
          response.status(400).json({
            error: error instanceof Error ? error.message : "농장 접속 실패",
          });
        }
      });
      app.get("/api/session", async (request, response) => {
        try {
          const token =
            request.headers.authorization?.replace(/^Bearer /, "") || "";
          response.setHeader("Cache-Control", "no-store");
          response.json(await options.store.authenticate(token));
        } catch {
          response.status(401).json({ error: "세션이 만료됐습니다" });
        }
      });
      app.get("/healthz", async (_request, response) => {
        const database = await options.store.health();
        response.status(closing || !database ? 503 : 200).json({
          status: closing
            ? "shutting-down"
            : database
              ? "ok"
              : "database-unavailable",
          database,
          service: "jiwoos-farm-v2.6",
          storageNamespace: options.store.namespace ?? "test",
          tickRate: SERVER_TICK_RATE,
          patchRate: PATCH_RATE,
          latencyMs,
          uptimeSeconds: process.uptime(),
        });
      });
    },
  });
  // Framework matchmaking routes bypass Express; guard those through the
  // official router too, so rejected sites cannot reserve or create rooms.
  server.router = createRouter(
    {},
    {
      onRequest: (request) =>
        !originAllowed(request.headers.get("origin"))
          ? new Response("Origin not allowed", { status: 403 })
          : undefined,
    },
  );
  server
    .define(ROOM_NAME, configuredFarmRoom(options.store))
    .filterBy(["farmId"]);
  server.simulateLatency(latencyMs);

  return {
    server,
    httpServer,
    async listen(): Promise<{ port: number; url: string }> {
      if (closing) throw new Error("Cannot restart a closed Lab server.");
      if (!listening) {
        await options.store.migrate();
        await server.listen(port, host);
        listening = true;
      }
      const address = httpServer.address();
      if (!address || typeof address === "string")
        throw new Error("Lab HTTP address is unavailable.");
      const publicHost =
        host === "0.0.0.0"
          ? "127.0.0.1"
          : host.includes(":")
            ? `[${host}]`
            : host;
      return { port: address.port, url: `ws://${publicHost}:${address.port}` };
    },
    close(): Promise<void> {
      if (closePromise) return closePromise;
      closing = true;
      const closed = httpServer.listening
        ? new Promise<void>((resolve) => {
            httpServer.once("close", resolve);
          })
        : Promise.resolve();
      closePromise = server.gracefullyShutdown(false).then(async () => {
        httpServer.closeAllConnections();
        await closed;
        await options.store.close();
      });
      return closePromise;
    },
  };
}

export type FarmServer = ReturnType<typeof createFarmServer>;
