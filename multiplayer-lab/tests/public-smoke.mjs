import assert from 'node:assert/strict';
import { BlockList, isIP } from 'node:net';
import { lookup } from 'node:dns/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import { Client } from '@colyseus/sdk';
import { chromium } from '@playwright/test';

const ROOM_NAME = 'multiplayer_lab';
const WAIT_MS = 15_000;
const blockedAddresses = new BlockList();
for (const [address, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.168.0.0', 16],
  ['192.0.2.0', 24], ['198.18.0.0', 15], ['198.51.100.0', 24],
  ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
]) blockedAddresses.addSubnet(address, prefix, 'ipv4');
for (const [address, prefix] of [
  ['::', 128], ['::1', 128], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8], ['2001:db8::', 32],
]) blockedAddresses.addSubnet(address, prefix, 'ipv6');

export function isNonPublicHost(hostname) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (host === 'localhost' || !host.includes('.') && !host.includes(':') ||
      /\.(?:localhost|local|internal|invalid|test)$/.test(host)) return true;
  const family = isIP(host);
  return family !== 0 && blockedAddresses.check(host, family === 6 ? 'ipv6' : 'ipv4');
}

export function readConfiguration(env = process.env, args = process.argv.slice(2)) {
  assert.ok(args.every((arg) => arg === '--allow-local'), 'Only --allow-local is supported; it is for an explicit local fixture, not public certification.');
  const allowLocal = args.includes('--allow-local');
  const parse = (name) => {
    assert.ok(env[name]?.trim(), `${name} is required.`);
    const url = new URL(env[name]);
    assert.ok(!url.username && !url.password && !url.search && !url.hash,
      `${name} must not contain credentials, query parameters, or fragments.`);
    assert.ok(url.protocol === 'https:' || allowLocal && url.protocol === 'http:',
      `${name} must use HTTPS; --allow-local explicitly allows an HTTP fixture.`);
    assert.ok(allowLocal || !isNonPublicHost(url.hostname), `${name} must have a public hostname, not localhost/LAN/reserved addresses.`);
    return url;
  };
  const backend = parse('PUBLIC_BACKEND_URL');
  const frontend = parse('PUBLIC_FRONTEND_URL');
  assert.equal(backend.pathname, '/', 'PUBLIC_BACKEND_URL must be the backend origin without a path.');
  const socket = new URL(backend);
  socket.protocol = backend.protocol === 'https:' ? 'wss:' : 'ws:';
  return { backend, frontend, socket, allowLocal };
}

export function scanClientBundle(source, allowLocal = false) {
  if (allowLocal) return;
  assert.ok(!/localhost/i.test(source), 'A deployed client bundle contains a localhost literal.');
  for (const candidate of source.matchAll(/(?:https?|wss?):\/\/[^\s"'`<>\\]+/g)) {
    let url;
    try { url = new URL(candidate[0]); } catch { continue; }
    assert.ok(!isNonPublicHost(url.hostname), `A deployed client bundle contains a local/LAN/reserved endpoint (${url.hostname}).`);
    assert.notEqual(url.protocol, 'ws:', 'A deployed client bundle contains an insecure ws:// endpoint.');
  }
}

async function waitFor(predicate, message, timeoutMs = WAIT_MS) {
  const deadline = performance.now() + timeoutMs;
  while (!predicate()) {
    assert.ok(performance.now() < deadline, `Timed out: ${message}`);
    await delay(20);
  }
}

async function bounded(operation, message, timeoutMs = WAIT_MS) {
  let timer;
  try {
    return await Promise.race([
      operation,
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`Timed out: ${message}`)), timeoutMs); }),
    ]);
  } finally { clearTimeout(timer); }
}

async function requirePublicDns(url, allowLocal) {
  if (allowLocal) return;
  assert.ok(!isNonPublicHost(url.hostname), 'Observed endpoint must be public.');
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  const addresses = await bounded(lookup(hostname, { all: true }), 'public DNS resolution');
  assert.ok(addresses.length > 0, 'Endpoint must resolve.');
  assert.ok(addresses.every(({ address }) => !isNonPublicHost(address)), `Endpoint ${url.hostname} resolves to a nonpublic address.`);
}

function player(room, sessionId) {
  const result = room.state?.players?.get(sessionId);
  assert.ok(result, `Expected player in synchronized room state.`);
  assert.ok(Number.isFinite(result.x) && Number.isFinite(result.y), 'Authoritative coordinates must be finite.');
  return result;
}

async function leave(room) {
  if (!room) return;
  room.reconnection.enabled = false;
  if (!room.connection.isOpen) return;
  try { await bounded(room.leave(), 'graceful room leave', 5_000); }
  finally { if (room.connection.isOpen) room.connection.close(); }
}

async function join(operation, rooms, label) {
  // If a bounded join finishes late, still leave its reserved test room.
  let abandoned = false;
  const tracked = operation.then(async (room) => {
    room.reconnection.enabled = false;
    if (abandoned) { await leave(room); throw new Error(`${label} completed after its deadline.`); }
    rooms.push(room);
    return room;
  });
  try { return await bounded(tracked, label); }
  catch (error) { abandoned = true; throw error; }
}

async function checkFrontend(configuration, room, observer, report) {
  const { backend, frontend, socket, allowLocal } = configuration;
  const browser = await chromium.launch({
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}),
    args: ['--enable-unsafe-swiftshader', '--disable-background-timer-throttling'],
  });
  const context = await browser.newContext({ viewport: { width: 1100, height: 850 } });
  const page = await context.newPage();
  const violations = [];
  const pageErrors = [];
  const observedSockets = [];
  const bundleChecks = [];
  const checkedAssets = new Set();
  const checkedOrigins = new Set();
  page.setDefaultTimeout(WAIT_MS);
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('websocket', (connection) => observedSockets.push(new URL(connection.url())));
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (['http:', 'https:'].includes(url.protocol)) {
      if (!allowLocal && (url.protocol !== 'https:' || isNonPublicHost(url.hostname))) {
        violations.push(`Nonpublic/insecure operational request: ${url.origin}`);
        await route.abort();
        return;
      }
      if (!checkedOrigins.has(url.origin)) {
        checkedOrigins.add(url.origin);
        try { await requirePublicDns(url, allowLocal); }
        catch (error) { violations.push(error.message); await route.abort(); return; }
      }
    }
    await route.continue();
  });
  // Guard before a native socket is constructed. Do not routeWebSocket(): its
  // protocol fallback differs from the SDK's native WebSocket constructor.
  await page.addInitScript(({ expectedOrigin }) => {
    const NativeWebSocket = window.WebSocket;
    window.WebSocket = class extends NativeWebSocket {
      constructor(address, protocols) {
        const target = new URL(address, window.location.href);
        if (target.origin !== expectedOrigin) throw new Error('PUBLIC_SMOKE: unexpected operational WebSocket endpoint');
        super(address, protocols);
      }
    };
  }, { expectedOrigin: socket.origin });
  page.on('response', (response) => {
    const url = new URL(response.url());
    if (url.origin !== frontend.origin || checkedAssets.has(url.href) || !/\.m?js(?:$|\?)/.test(url.pathname)) return;
    checkedAssets.add(url.href);
    // Resolve failures to data immediately so an early browser error cannot
    // leave an unhandled rejected response-body promise.
    bundleChecks.push(response.text().then((source) => {
      scanClientBundle(source, allowLocal);
      return { ok: true };
    }).catch((error) => ({ ok: false, message: error.message })));
  });
  let joined = false;
  try {
    const response = await page.goto(frontend.href, { waitUntil: 'domcontentloaded', timeout: WAIT_MS });
    assert.ok(response?.ok(), 'Public frontend must load successfully.');
    const loaded = new URL(page.url());
    assert.ok(allowLocal || loaded.protocol === 'https:', 'Frontend redirect must preserve HTTPS.');
    await requirePublicDns(loaded, allowLocal);
    await page.locator('#nickname').fill('Public browser smoke');
    await page.locator('#room-code').fill(room.roomId);
    await page.locator('#join-room').click();
    await page.waitForFunction(() => document.querySelector('#connection-status')?.getAttribute('data-state') === 'connected', undefined, { timeout: WAIT_MS });
    joined = true;
    await page.locator('canvas').waitFor({ state: 'visible' });
    await waitFor(() => room.state.players.size === 3 && observer.state.players.size === 3, 'browser appears on both SDK peers');
    assert.ok(observedSockets.length > 0, 'Frontend must open a real game WebSocket.');
    assert.ok(observedSockets.every((url) => url.origin === socket.origin), 'Every frontend WebSocket must use the configured backend origin.');
    assert.ok(allowLocal || observedSockets.every((url) => url.protocol === 'wss:'), 'Public game sockets must use WSS.');
    assert.ok(checkedAssets.size > 0, 'Compiled frontend JavaScript must be loaded.');
    const checkedBundles = await Promise.all(bundleChecks);
    assert.ok(checkedBundles.every((result) => result.ok), checkedBundles.filter((result) => !result.ok).map((result) => result.message).join('; '));
    assert.deepEqual(violations, [], 'No operational localhost/LAN/insecure requests are permitted.');
    assert.deepEqual(pageErrors, [], 'Frontend must have no uncaught browser errors.');
    report.frontend = { loaded: true, canvas: true, configuredWebSocketOrigin: socket.origin, bundleCount: checkedAssets.size, joinedPlayerCount: 3 };
    await page.locator('#leave-room').click();
    await waitFor(() => room.state.players.size === 2 && observer.state.players.size === 2, 'browser graceful cleanup observed by both SDK peers');
    joined = false;
  } finally {
    if (joined) {
      try { await page.locator('#leave-room').click({ timeout: 2_000 }); }
      catch { /* Closing the context still invokes the server's bounded drop cleanup. */ }
    }
    await context.close();
    await browser.close();
  }
}

export async function runPublicSmoke(configuration) {
  const { backend, frontend, socket, allowLocal } = configuration;
  await Promise.all([requirePublicDns(backend, allowLocal), requirePublicDns(frontend, allowLocal)]);
  const report = {
    mode: allowLocal ? 'LOCAL FIXTURE — NOT PUBLIC DEPLOYMENT CERTIFICATION' : 'PUBLIC HTTPS/WSS',
    backend: backend.origin,
    frontendUrl: frontend.href,
    health: null,
    multiplayer: null,
    frontend: null,
    cleanup: null,
  };
  const healthResponse = await fetch(new URL('/healthz', backend), {
    headers: { Origin: frontend.origin }, signal: AbortSignal.timeout(WAIT_MS), redirect: 'error',
  });
  assert.equal(healthResponse.status, 200, 'Backend health must return HTTP 200 for the deployed frontend origin.');
  const health = await healthResponse.json();
  assert.equal(health.status, 'ok');
  assert.equal(health.service, 'jiwoos-multiplayer-lab');
  assert.equal(health.latencyMs, 0, 'Production must have zero injected latency.');
  assert.equal(health.tickRate, 30, 'Expected authoritative 30 Hz simulation.');
  assert.ok(Number.isFinite(health.patchRate) && health.patchRate >= 20 && health.patchRate <= 30);
  report.health = health;

  const rooms = [];
  try {
    const a = await join(new Client(socket.href).create(ROOM_NAME, { nickname: 'Public smoke A' }), rooms, 'create test room');
    const b = await join(new Client(socket.href).joinById(a.roomId, { nickname: 'Public smoke B' }), rooms, 'join test room');
    await waitFor(() => a.state?.players?.size === 2 && b.state?.players?.size === 2, 'two real SDK peers synchronize');
    assert.equal(a.roomId, b.roomId);
    assert.notEqual(a.sessionId, b.sessionId);
    for (const room of rooms) {
      const connectedUrl = new URL(room.connection.url);
      assert.equal(connectedUrl.origin, socket.origin, 'SDK must connect to the supplied deployed backend.');
      assert.ok(allowLocal || connectedUrl.protocol === 'wss:', 'SDK public connections must actually use WSS.');
    }
    const original = { x: player(a, a.sessionId).x, y: player(a, a.sessionId).y };
    const input = a.input({ mode: 'reliable' }); // Official handshake supplies the input schema.
    assert.equal(input.tickRate, 30);
    const startTick = a.state.tick;
    Object.assign(input.data, { moveX: 1, moveY: 0, run: false });
    const steps = 9;
    for (let step = 0; step < steps; step += 1) {
      assert.ok(input.send() > 0, 'Input must be transmitted over the live connection.');
      await delay(1_000 / input.tickRate);
    }
    const expectedSequence = input.sentCount;
    await waitFor(() => input.lastProcessed >= expectedSequence, 'server acknowledges all movement inputs');
    await waitFor(() => {
      const local = player(a, a.sessionId);
      const remote = player(b, a.sessionId);
      return local.x > original.x + 1 && Math.hypot(local.x - remote.x, local.y - remote.y) < 1e-6;
    }, 'authoritative movement reaches and converges on both SDK peers');
    assert.ok(a.state.tick > startTick, 'Server simulation ticks must advance.');
    assert.equal(input.pendingCount, 0);
    report.multiplayer = {
      roomCreated: true, twoSdkPlayers: true, inputSteps: steps,
      authoritativeDisplacement: player(a, a.sessionId).x - original.x,
      peerConvergence: true, websocketProtocol: socket.protocol,
    };
    await checkFrontend(configuration, a, b, report);
    const leavingSession = a.sessionId;
    await leave(a);
    await waitFor(() => !b.state.players.has(leavingSession) && b.state.players.size === 1, 'peer observes consented leave cleanup');
    await leave(b);
    report.cleanup = { browserLeaveObserved: true, sdkPeerLeaveObserved: true, bothSdkConnectionsClosed: !a.connection.isOpen && !b.connection.isOpen };
    assert.ok(report.cleanup.bothSdkConnectionsClosed);
    return report;
  } finally {
    const cleanup = await Promise.allSettled(rooms.map((room) => leave(room)));
    const failed = cleanup.find((result) => result.status === 'rejected');
    if (failed?.status === 'rejected') console.error(`Cleanup warning: ${failed.reason instanceof Error ? failed.reason.message : String(failed.reason)}`);
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const deadline = setTimeout(() => {
    console.error('FAIL: public smoke exceeded its 90-second total deadline.');
    process.exit(1);
  }, 90_000);
  try {
    const report = await runPublicSmoke(readConfiguration());
    console.log(JSON.stringify({ result: 'PASS', ...report }, null, 2));
  } catch (error) {
    console.error(`FAIL: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  } finally { clearTimeout(deadline); }
}
