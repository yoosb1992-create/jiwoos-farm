import 'dotenv/config';
import { createLabServer } from './createLabServer.js';

const port = Number(process.env.PORT || 2567);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be 1..65535.');
const lab = createLabServer({
  port,
  host: process.env.HOST || '0.0.0.0',
  clientOrigins: (process.env.CLIENT_ORIGINS || '').split(',').map((origin) => origin.trim()).filter(Boolean),
  latencyMs: Number(process.env.LAB_LATENCY_MS || 0),
});

let stopping = false;
async function shutdown(signal: string): Promise<void> {
  if (stopping) return;
  stopping = true;
  console.info(`[lab] ${signal}: closing rooms and WebSockets`);
  const deadline = setTimeout(() => process.exit(1), 10_000);
  deadline.unref();
  try {
    await lab.close();
    process.exitCode = 0;
  } catch (error) {
    console.error('[lab] shutdown failed', error);
    process.exitCode = 1;
  } finally {
    clearTimeout(deadline);
  }
}
process.once('SIGINT', () => { void shutdown('SIGINT'); });
process.once('SIGTERM', () => { void shutdown('SIGTERM'); });

try {
  const address = await lab.listen();
  console.info(`[lab] listening at ${address.url}; health /healthz`);
} catch (error) {
  console.error('[lab] startup failed', error);
  await lab.close();
  process.exitCode = 1;
}
