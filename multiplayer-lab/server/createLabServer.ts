import { createServer } from 'node:http';
import { Server, createRouter } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { RECONNECTION_SECONDS, ROOM_NAME, SERVER_TICK_RATE, PATCH_RATE } from '../shared/config.js';
import { configuredLabRoom } from './LabRoom.js';

export interface LabServerOptions {
  port?: number;
  host?: string;
  clientOrigins?: readonly string[];
  reconnectionSeconds?: number;
  /** Added round-trip milliseconds, dev/test only. */
  latencyMs?: number;
  production?: boolean;
}

export function createLabServer(options: LabServerOptions = {}) {
  const production = options.production ?? process.env.NODE_ENV === 'production';
  const latencyMs = production ? 0 : (options.latencyMs ?? 0);
  if (![0, 50, 100, 200].includes(latencyMs)) {
    throw new Error('LAB_LATENCY_MS must be 0, 50, 100 or 200 (added round-trip milliseconds).');
  }
  // Colyseus also recognizes its own latency env during listen(). Prevent a
  // forgotten development variable from silently delaying a production server.
  if (Number(process.env.COLYSEUS_LATENCY || 0) !== 0) {
    throw new Error('COLYSEUS_LATENCY must be unset; use development-only LAB_LATENCY_MS instead.');
  }

  const host = options.host ?? '0.0.0.0';
  const port = options.port ?? 2567;
  const reconnectionSeconds = options.reconnectionSeconds ?? RECONNECTION_SECONDS;
  if (!Number.isFinite(reconnectionSeconds) || reconnectionSeconds < 0 || reconnectionSeconds > 120) {
    throw new Error('Invalid server-only reconnection grace.');
  }
  const origins = new Set(options.clientOrigins ?? []);
  if (production && origins.size === 0) {
    throw new Error('CLIENT_ORIGINS must list the allowed client origin(s) in production.');
  }
  for (const origin of origins) {
    const parsed = new URL(origin);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== origin) {
      throw new Error('CLIENT_ORIGINS entries must be exact http(s) origins without a path.');
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
      if (!originAllowed(request.headers.get('origin'))) {
        return new Response('Origin not allowed', { status: 403 });
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
      app.disable('x-powered-by');
      app.use((request, response, next) => {
        if (!originAllowed(request.headers.origin)) {
          response.status(403).json({ error: 'Origin not allowed' });
          return;
        }
        next();
      });
      app.get('/healthz', (_request, response) => {
        response.status(closing ? 503 : 200).json({
          status: closing ? 'shutting-down' : 'ok',
          service: 'jiwoos-multiplayer-lab',
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
  server.router = createRouter({}, {
    onRequest: (request) => !originAllowed(request.headers.get('origin'))
      ? new Response('Origin not allowed', { status: 403 }) : undefined,
  });
  server.define(ROOM_NAME, configuredLabRoom(reconnectionSeconds));
  server.simulateLatency(latencyMs);

  return {
    server,
    httpServer,
    async listen(): Promise<{ port: number; url: string }> {
      if (closing) throw new Error('Cannot restart a closed Lab server.');
      if (!listening) {
        await server.listen(port, host);
        listening = true;
      }
      const address = httpServer.address();
      if (!address || typeof address === 'string') throw new Error('Lab HTTP address is unavailable.');
      const publicHost = host === '0.0.0.0' ? '127.0.0.1' : host.includes(':') ? `[${host}]` : host;
      return { port: address.port, url: `ws://${publicHost}:${address.port}` };
    },
    close(): Promise<void> {
      if (closePromise) return closePromise;
      closing = true;
      const closed = httpServer.listening
        ? new Promise<void>((resolve) => { httpServer.once('close', resolve); })
        : Promise.resolve();
      closePromise = server.gracefullyShutdown(false).then(async () => {
        httpServer.closeAllConnections();
        await closed;
      });
      return closePromise;
    },
  };
}

export type LabServer = ReturnType<typeof createLabServer>;
