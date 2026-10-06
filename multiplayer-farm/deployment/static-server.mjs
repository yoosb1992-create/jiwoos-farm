import { constants, accessSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import express from 'express';

const MODULE_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const DEFAULT_CLIENT_DIRECTORY = resolve(MODULE_DIRECTORY, '../dist/client');
const DEFAULT_PORT = 8080;
const DEFAULT_SHUTDOWN_GRACE_MS = 10_000;
const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1_000;

function environmentPort() {
  const value = process.env.PORT;
  const port = value === undefined || value === '' ? DEFAULT_PORT : Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('PORT must be an integer from 1 to 65535.');
  }
  return port;
}

/**
 * A production HTTP service for the independently built Vite client.
 * No matchmaking, WebSocket, database, or original-game routes run here.
 *
 * @param {{ clientDir?: string, host?: string, port?: number, shutdownGraceMs?: number }} [options]
 */
export function createStaticServer(options = {}) {
  const clientDir = resolve(options.clientDir ?? DEFAULT_CLIENT_DIRECTORY);
  const indexFile = resolve(clientDir, 'index.html');
  const host = options.host ?? '0.0.0.0';
  // Explicit 0 is useful for isolated ephemeral-port tests. Railway's PORT
  // environment value, read only when no override is supplied, must be nonzero.
  const port = options.port ?? environmentPort();
  const shutdownGraceMs = options.shutdownGraceMs ?? DEFAULT_SHUTDOWN_GRACE_MS;
  if (!Number.isInteger(port) || port < 0 || port > 65_535) throw new Error('Invalid static server port.');
  if (!Number.isFinite(shutdownGraceMs) || shutdownGraceMs <= 0) throw new Error('Invalid shutdown grace period.');

  const app = express();
  app.disable('x-powered-by');
  let closing = false;
  let listenPromise;
  let closePromise;

  app.use((_request, response, next) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    next();
  });

  app.get('/healthz', (_request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.status(closing ? 503 : 200).json({
      status: closing ? 'shutting-down' : 'ok',
      service: 'jiwoos-farm-v2.5-client',
    });
  });

  // Vite emits content-hashed files into assets/. A missing asset must remain
  // a real 404, never an index.html response with an immutable cache header.
  app.use('/assets', express.static(resolve(clientDir, 'assets'), {
    index: false,
    redirect: false,
    dotfiles: 'deny',
    fallthrough: false,
    maxAge: ONE_YEAR_MS,
    immutable: true,
    setHeaders(response, file) {
      // Reused public PNGs keep their original names and must revalidate.
      if (!/[-][A-Za-z0-9_-]{8,}\.(?:js|css)$/.test(file)) response.setHeader('Cache-Control', 'no-cache');
    },
  }));

  app.use(express.static(clientDir, {
    index: 'index.html',
    redirect: false,
    dotfiles: 'ignore',
    setHeaders(response) {
      // Revalidate the entry point and unhashed public files on every visit.
      // This allows a deploy to reference new assets without stale HTML.
      response.setHeader('Cache-Control', 'no-cache');
    },
  }));

  app.use((_request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.status(404).json({ error: 'Not found' });
  });

  // Express error handlers require all four arguments, including next.
  app.use((error, _request, response, _next) => {
    if (response.headersSent) {
      response.destroy();
      return;
    }
    const status = Number.isInteger(error.status) && error.status >= 400 && error.status < 500
      ? error.status : 500;
    response.setHeader('Cache-Control', 'no-store');
    response.status(status).json({ error: status === 500 ? 'Unable to serve file' : 'Not found' });
  });

  const httpServer = createServer(app);

  return {
    httpServer,
    async listen() {
      if (closing) throw new Error('Cannot start a closed static server.');
      if (listenPromise) return listenPromise;
      try {
        accessSync(indexFile, constants.R_OK);
        if (!statSync(indexFile).isFile()) throw new Error('index.html is not a file');
      } catch {
        throw new Error(`Built client index is missing or unreadable: ${indexFile}. Run the client build first.`);
      }
      listenPromise = new Promise((resolveListen, rejectListen) => {
        const onError = (error) => { httpServer.off('listening', onListening); rejectListen(error); };
        const onListening = () => {
          httpServer.off('error', onError);
          const address = httpServer.address();
          if (!address || typeof address === 'string') {
            rejectListen(new Error('Static server address is unavailable.'));
            return;
          }
          const urlHost = host === '0.0.0.0' ? '127.0.0.1' : host.includes(':') ? `[${host}]` : host;
          resolveListen({ host, port: address.port, url: `http://${urlHost}:${address.port}` });
        };
        httpServer.once('error', onError);
        httpServer.once('listening', onListening);
        httpServer.listen(port, host);
      });
      return listenPromise;
    },
    close() {
      if (closePromise) return closePromise;
      closing = true;
      closePromise = (async () => {
        // A signal during bind must not leave a newly opened listener behind.
        if (listenPromise) await listenPromise.catch(() => undefined);
        if (!httpServer.listening) return;
        await new Promise((resolveClose, rejectClose) => {
          // Let in-flight downloads finish. Bound the grace period so a paused
          // client cannot keep Railway shutdown alive indefinitely.
          const deadline = setTimeout(() => httpServer.closeAllConnections(), shutdownGraceMs);
          deadline.unref();
          httpServer.close((error) => {
            clearTimeout(deadline);
            if (error) rejectClose(error);
            else resolveClose();
          });
          httpServer.closeIdleConnections();
        });
      })();
      return closePromise;
    },
  };
}

/** CLI lifecycle, exported so a child-process test can exercise real signals. */
export async function startStaticServer(options = {}) {
  const server = createStaticServer(options);
  let stopping = false;
  const shutdown = async (signal) => {
    if (stopping) return;
    stopping = true;
    console.info(`[lab-client] ${signal}: closing HTTP service`);
    try {
      await server.close();
      process.exitCode = 0;
    } catch (error) {
      console.error('[lab-client] shutdown failed', error);
      process.exitCode = 1;
    } finally {
      process.off('SIGINT', onSigint);
      process.off('SIGTERM', onSigterm);
    }
  };
  const onSigint = () => { void shutdown('SIGINT'); };
  const onSigterm = () => { void shutdown('SIGTERM'); };
  process.once('SIGINT', onSigint);
  process.once('SIGTERM', onSigterm);
  try {
    const address = await server.listen();
    console.info(`[lab-client] listening at ${address.url}; bind ${address.host}:${address.port}; health /healthz`);
    return server;
  } catch (error) {
    process.off('SIGINT', onSigint);
    process.off('SIGTERM', onSigterm);
    await server.close();
    throw error;
  }
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (invokedDirectly) {
  try {
    await startStaticServer();
  } catch (error) {
    console.error('[lab-client] startup failed', error);
    process.exitCode = 1;
  }
}
