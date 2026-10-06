import assert from 'node:assert/strict';
import { test } from 'node:test';

type SmokeModule = {
  isNonPublicHost(hostname: string): boolean;
  readConfiguration(env: Record<string, string>, args: string[]): {
    backend: URL; frontend: URL; socket: URL; allowLocal: boolean;
  };
  scanClientBundle(source: string, allowLocal?: boolean): void;
};
const moduleUrl = new URL('./public-smoke.mjs', import.meta.url).href;
const smoke = await import(moduleUrl) as SmokeModule;

test('public deployment smoke requires explicit HTTPS public endpoints by default', () => {
  const valid = { PUBLIC_BACKEND_URL: 'https://lab-backend.example.com', PUBLIC_FRONTEND_URL: 'https://lab-client.example.com' };
  const configuration = smoke.readConfiguration(valid, []);
  assert.equal(configuration.socket.origin, 'wss://lab-backend.example.com');
  assert.equal(configuration.allowLocal, false);
  assert.throws(() => smoke.readConfiguration({}, []), /PUBLIC_BACKEND_URL/);
  for (const endpoint of ['http://lab.example.com', 'https://localhost', 'https://192.168.1.10', 'https://[::1]', 'https://lab.local', 'https://user:password@lab.example.com', 'https://lab.example.com?token=secret']) {
    assert.throws(() => smoke.readConfiguration({ ...valid, PUBLIC_BACKEND_URL: endpoint }, []));
  }
});

test('local deployment fixture is explicitly labeled and opt-in only', () => {
  const local = { PUBLIC_BACKEND_URL: 'http://127.0.0.1:2567', PUBLIC_FRONTEND_URL: 'http://127.0.0.1:5173' };
  assert.throws(() => smoke.readConfiguration(local, []));
  const configuration = smoke.readConfiguration(local, ['--allow-local']);
  assert.equal(configuration.allowLocal, true);
  assert.equal(configuration.socket.origin, 'ws://127.0.0.1:2567');
  assert.throws(() => smoke.readConfiguration(local, ['--skip-browser']), /Only --allow-local/);
});

test('public endpoint validation excludes private, loopback, reserved and mapped IP addresses', () => {
  for (const hostname of ['localhost', 'LOCALHOST.', '127.0.0.1', '10.2.3.4', '172.16.10.2', '192.168.1.1', '169.254.169.254', '100.64.1.1', '[::1]', '::ffff:127.0.0.1', 'fc00::1', 'fe80::1', 'lab.internal', 'lab.invalid']) {
    assert.equal(smoke.isNonPublicHost(hostname), true, hostname);
  }
  for (const hostname of ['lab.example.com', '8.8.8.8', '2606:4700:4700::1111']) {
    assert.equal(smoke.isNonPublicHost(hostname), false, hostname);
  }
});

test('deployed bundle scan rejects local fallback endpoints and insecure WebSocket literals', () => {
  smoke.scanClientBundle('const endpoint="wss://lab.example.com";');
  for (const source of ['const endpoint="ws://localhost:2567";', 'const fallback="localhost";', 'const endpoint="wss://192.168.1.2";', 'const endpoint="ws://lab.example.com";']) {
    assert.throws(() => smoke.scanClientBundle(source));
  }
  smoke.scanClientBundle('const fixture="ws://127.0.0.1:2567";', true);
});
