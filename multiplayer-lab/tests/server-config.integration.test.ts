import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createLabServer } from '../server/createLabServer.js';

test('production health, origin checks, and latency isolation work over HTTP', async (t) => {
  const server = createLabServer({
    port: 0,
    host: '127.0.0.1',
    production: true,
    clientOrigins: ['https://lab.example'],
    latencyMs: 200, // Must be ignored in production, even if left in config.
  });
  t.after(() => server.close());
  const { port } = await server.listen();
  const base = `http://127.0.0.1:${port}`;
  const response = await fetch(`${base}/healthz`, { headers: { Origin: 'https://lab.example' } });
  assert.equal(response.status, 200);
  const health = await response.json() as Record<string, unknown>;
  assert.equal(health.status, 'ok');
  assert.equal(health.service, 'jiwoos-multiplayer-lab');
  assert.equal(health.tickRate, 30);
  assert.equal(health.latencyMs, 0, 'production disables artificial latency');
  assert.equal((await fetch(`${base}/healthz`, { headers: { Origin: 'https://unknown.example' } })).status, 403);
  const rejectedMatchmaking = await fetch(`${base}/matchmake/create/multiplayer_lab`, {
    method: 'POST',
    headers: { Origin: 'https://unknown.example', 'Content-Type': 'application/json' },
    body: JSON.stringify({ nickname: 'Rejected' }),
  });
  assert.equal(rejectedMatchmaking.status, 403, 'origin policy covers framework routes too');
  // Origin-less Node clients are intentionally allowed in this unauthenticated lab.
  assert.equal((await fetch(`${base}/healthz`)).status, 200);
});
