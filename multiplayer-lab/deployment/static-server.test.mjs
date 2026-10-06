import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createStaticServer } from './static-server.mjs';

async function fixture(t) {
  const clientDir = await mkdtemp(join(tmpdir(), 'jiwoos-static-test-'));
  await mkdir(join(clientDir, 'assets'));
  await writeFile(join(clientDir, 'index.html'), '<!doctype html><title>Isolated lab fixture</title>');
  await writeFile(join(clientDir, 'assets', 'app-abc123.js'), 'console.log("fixture");');
  await writeFile(join(clientDir, 'robots.txt'), 'User-agent: *\nDisallow: /');
  await writeFile(join(clientDir, '.env'), 'SHOULD_NOT_BE_PUBLIC=true');
  t.after(() => rm(clientDir, { recursive: true, force: true }));
  return clientDir;
}

test('production HTTP serves the built entry, health and hashed assets with appropriate caching', async (t) => {
  const clientDir = await fixture(t);
  const server = createStaticServer({ clientDir, port: 0 });
  t.after(() => server.close());
  const address = await server.listen();
  assert.equal(address.host, '0.0.0.0', 'default bind must accept Railway ingress');
  assert.ok(address.port > 0);
  assert.equal(await server.listen(), address, 'listen is idempotent');

  const health = await fetch(`${address.url}/healthz`);
  assert.equal(health.status, 200);
  assert.equal(health.headers.get('cache-control'), 'no-store');
  assert.equal(health.headers.get('x-powered-by'), null);
  assert.deepEqual(await health.json(), { status: 'ok', service: 'jiwoos-multiplayer-lab-client' });

  for (const path of ['/', '/index.html']) {
    const response = await fetch(`${address.url}${path}`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-cache');
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.match(response.headers.get('content-type'), /text\/html/);
    assert.match(await response.text(), /Isolated lab fixture/);
  }

  const asset = await fetch(`${address.url}/assets/app-abc123.js`);
  assert.equal(asset.status, 200);
  assert.match(asset.headers.get('cache-control'), /max-age=31536000/);
  assert.match(asset.headers.get('cache-control'), /immutable/);
  assert.equal(await asset.text(), 'console.log("fixture");');

  const publicFile = await fetch(`${address.url}/robots.txt`);
  assert.equal(publicFile.headers.get('cache-control'), 'no-cache');
  assert.equal(await publicFile.text(), 'User-agent: *\nDisallow: /');

  const head = await fetch(`${address.url}/index.html`, { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(head.headers.get('cache-control'), 'no-cache');
  assert.equal(await head.text(), '');
});

test('missing assets, unknown paths and dotfiles cannot return an immutable HTML fallback', async (t) => {
  const clientDir = await fixture(t);
  const server = createStaticServer({ clientDir, host: '127.0.0.1', port: 0 });
  t.after(() => server.close());
  const { url } = await server.listen();
  for (const path of ['/assets/missing.js', '/missing', '/.env']) {
    const response = await fetch(`${url}${path}`);
    assert.equal(response.status, 404);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await response.json(), { error: 'Not found' });
  }
});

test('close is idempotent, releases its actual HTTP listener and prevents restart', async (t) => {
  const clientDir = await fixture(t);
  const server = createStaticServer({ clientDir, host: '127.0.0.1', port: 0 });
  t.after(() => server.close());
  const { url } = await server.listen();
  assert.equal((await fetch(`${url}/healthz`)).status, 200);
  const firstClose = server.close();
  assert.equal(server.close(), firstClose);
  await firstClose;
  assert.equal(server.httpServer.listening, false);
  await assert.rejects(() => fetch(`${url}/healthz`));
  await assert.rejects(() => server.listen(), /closed static server/);
});

test('missing production build fails startup instead of returning a misleading healthy service', async (t) => {
  const clientDir = await fixture(t);
  await rm(join(clientDir, 'index.html'));
  const server = createStaticServer({ clientDir, port: 0 });
  t.after(() => server.close());
  await assert.rejects(() => server.listen(), /Run the client build first/);
  assert.equal(server.httpServer.listening, false);
});

test('environment PORT is validated while explicit test port 0 remains available', async (t) => {
  const previous = process.env.PORT;
  t.after(() => {
    if (previous === undefined) delete process.env.PORT;
    else process.env.PORT = previous;
  });
  for (const value of ['0', '-1', '65536', 'invalid', '3.5']) {
    process.env.PORT = value;
    assert.throws(() => createStaticServer(), /PORT must be/);
  }
  process.env.PORT = '8080';
  const server = createStaticServer({ port: 0 });
  await server.close();
});

test('SIGTERM gracefully closes a running production HTTP service in a child process', { timeout: 10_000 }, async (t) => {
  const clientDir = await fixture(t);
  const moduleUrl = new URL('./static-server.mjs', import.meta.url).href;
  const code = `import { startStaticServer } from ${JSON.stringify(moduleUrl)}; await startStaticServer({ clientDir: ${JSON.stringify(clientDir)}, host: '127.0.0.1', port: 0 });`;
  const child = spawn(process.execPath, ['--input-type=module', '-e', code], { stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(() => { if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL'); });
  let output = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => { output += chunk; });
  const url = await new Promise((resolveUrl, rejectUrl) => {
    const deadline = setTimeout(() => rejectUrl(new Error(`Child startup timed out: ${output}`)), 5_000);
    const onExit = (code) => { clearTimeout(deadline); rejectUrl(new Error(`Child exited (${code}): ${output}`)); };
    child.once('exit', onExit);
    child.stdout.on('data', (chunk) => {
      output += chunk;
      const match = output.match(/listening at (http:\/\/127\.0\.0\.1:\d+)/);
      if (!match) return;
      clearTimeout(deadline);
      child.off('exit', onExit);
      resolveUrl(match[1]);
    });
  });
  const health = await fetch(`${url}/healthz`);
  assert.equal(health.status, 200);
  await health.arrayBuffer();
  const exited = once(child, 'exit');
  child.kill('SIGTERM');
  const [codeValue, signal] = await exited;
  assert.equal(codeValue, 0, output);
  assert.equal(signal, null, output);
  assert.match(output, /SIGTERM: closing HTTP service/);
  await assert.rejects(() => fetch(`${url}/healthz`));
});
