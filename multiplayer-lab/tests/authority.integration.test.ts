import assert from 'node:assert/strict';
import { after, before, describe, test, type TestContext } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { Client } from '@colyseus/sdk';
import { createLabServer } from '../server/createLabServer.js';
import { CloseCode, matchMaker } from '@colyseus/core';
import { type LabRoom } from '../server/LabRoom.js';
import {
  CATCHUP_CREDIT_EXPIRY_MS, MAP_HEIGHT, MAP_WIDTH, MAX_MESSAGES_PER_SECOND, MAX_MOVEMENT_SUBSTEP, OBSTACLES, PLAYER_RADIUS,
  RUN_SPEED, SERVER_TICK_RATE, WALK_SPEED,
} from '../shared/config.js';
import { type LabState } from '../shared/schema.js';
import {
  authority, closeRooms, dropConnection, joinPair, movement, ping, player,
  point, sendSteps, waitFor, type TestRoom, type TestServer,
} from './helpers.js';

const EPSILON = 1e-6;
const near = (actual: number, expected: number, label: string) =>
  assert.ok(Math.abs(actual - expected) < EPSILON, `${label}: ${actual} ≈ ${expected}`);

describe('authoritative Colyseus server with real WebSocket SDK clients', { concurrency: false }, () => {
  let server: TestServer;
  let url: string;

  before(async () => {
    server = createLabServer({ port: 0, host: '127.0.0.1', reconnectionSeconds: 1 });
    ({ url } = await server.listen());
  });

  after(async () => {
    server.server.simulateLatency(0);
    await server.close();
  });

  async function pair(t: TestContext): Promise<[TestRoom, TestRoom]> {
    const rooms = await joinPair(url);
    t.after(() => closeRooms(rooms));
    return rooms;
  }

  test('1: two players create/join the same room with distinct identities', async (t) => {
    const [a, b] = await pair(t);
    assert.equal(a.roomId, b.roomId);
    assert.notEqual(a.sessionId, b.sessionId);
    assert.equal(authority(a).players.size, 2);
    assert.equal(player(a.state, a.sessionId).nickname, 'Alice');
    assert.equal(player(b.state, b.sessionId).nickname, 'Bob');
    assert.notEqual(player(a.state, a.sessionId).color, player(a.state, b.sessionId).color);
    assert.equal(movement(a).tickRate, SERVER_TICK_RATE, 'input timestep is advertised by the server');
  });

  test('2: movement inputs change actual server authority by the shared fixed step', async (t) => {
    const [a] = await pair(t);
    const state = authority(a);
    const controlled = player(state, a.sessionId);
    // Tests arrange a clear start directly on the SERVER; this is never a client command.
    Object.assign(controlled, { x: 64, y: 64 });
    await sendSteps(a, { moveX: 1, moveY: 0, run: false }, 9);
    near(controlled.x, 64 + 9 * WALK_SPEED / SERVER_TICK_RATE, 'server displacement');
    near(controlled.y, 64, 'server y');
    assert.ok(state.tick > 0);
  });

  test('3: a second client receives the first player authoritative movement', async (t) => {
    const [a, b] = await pair(t);
    const controlled = player(authority(a), a.sessionId);
    Object.assign(controlled, { x: 64, y: 64 });
    await sendSteps(a, { moveX: 1, moveY: 0, run: false }, 6);
    await waitFor(() => Math.abs(player(b.state, a.sessionId).x - controlled.x) < EPSILON, 'B sees authoritative A');
    near(player(b.state, a.sessionId).x, controlled.x, 'remote state');
  });

  test('4: both clients converge to the same server state after simultaneous movement', async (t) => {
    const [a, b] = await pair(t);
    const state = authority(a);
    Object.assign(player(state, a.sessionId), { x: 64, y: 64 });
    Object.assign(player(state, b.sessionId), { x: 128, y: 64 });
    await Promise.all([
      sendSteps(a, { moveX: 1, moveY: 0, run: false }, 12),
      sendSteps(b, { moveX: 0, moveY: 1, run: true }, 12),
    ]);
    await waitFor(() => [a, b].every((view) => [a.sessionId, b.sessionId].every((id) => {
      const expected = player(state, id);
      const actual = player(view.state, id);
      return Math.hypot(actual.x - expected.x, actual.y - expected.y) < EPSILON;
    })), 'all authoritative player positions converge');
    for (const id of [a.sessionId, b.sessionId]) {
      assert.deepEqual(point(player(a.state, id)), point(player(b.state, id)));
    }
  });

  test('5: running is faster than walking for equal acknowledged input steps', async (t) => {
    const [a, b] = await pair(t);
    const state = authority(a);
    Object.assign(player(state, a.sessionId), { x: 64, y: 64 });
    Object.assign(player(state, b.sessionId), { x: 64, y: 64 });
    await Promise.all([
      sendSteps(a, { moveX: 1, moveY: 0, run: false }, 12),
      sendSteps(b, { moveX: 1, moveY: 0, run: true }, 12),
    ]);
    const walked = player(state, a.sessionId).x - 64;
    const ran = player(state, b.sessionId).x - 64;
    assert.ok(ran > walked);
    near(ran / walked, RUN_SPEED / WALK_SPEED, 'run/walk ratio');
  });

  test('6: diagonal input does not create a square-root-of-two speed advantage', async (t) => {
    const [a, b] = await pair(t);
    const state = authority(a);
    Object.assign(player(state, a.sessionId), { x: 64, y: 64 });
    Object.assign(player(state, b.sessionId), { x: 64, y: 64 });
    await Promise.all([
      sendSteps(a, { moveX: 1, moveY: 0, run: false }, 9),
      sendSteps(b, { moveX: 1, moveY: 1, run: false }, 9),
    ]);
    const diagonal = player(state, b.sessionId);
    near(Math.hypot(diagonal.x - 64, diagonal.y - 64), player(state, a.sessionId).x - 64, 'diagonal/straight distance');
  });

  test('7: server prevents moving out of the map and through obstacles', async (t) => {
    const [a, b] = await pair(t);
    const state = authority(a);
    const controlled = player(state, a.sessionId);
    Object.assign(controlled, { x: PLAYER_RADIUS + 1, y: PLAYER_RADIUS + 1 });
    await sendSteps(a, { moveX: -1, moveY: -1, run: true }, 5);
    near(controlled.x, PLAYER_RADIUS, 'left edge');
    near(controlled.y, PLAYER_RADIUS, 'top edge');
    Object.assign(controlled, { x: MAP_WIDTH - PLAYER_RADIUS - 1, y: MAP_HEIGHT - PLAYER_RADIUS - 1 });
    await sendSteps(a, { moveX: 1, moveY: 1, run: true }, 5);
    near(controlled.x, MAP_WIDTH - PLAYER_RADIUS, 'right edge');
    near(controlled.y, MAP_HEIGHT - PLAYER_RADIUS, 'bottom edge');
    const obstacle = OBSTACLES[0];
    assert.ok(obstacle);
    Object.assign(controlled, { x: obstacle.x - PLAYER_RADIUS - 1, y: obstacle.y + obstacle.height / 2 });
    await sendSteps(a, { moveX: 1, moveY: 0, run: true }, 10);
    assert.ok(controlled.x <= obstacle.x - PLAYER_RADIUS, 'obstacle stops player');
    assert.ok(obstacle.x - PLAYER_RADIUS - controlled.x <= MAX_MOVEMENT_SUBSTEP);
    await waitFor(() => Math.abs(player(b.state, a.sessionId).x - controlled.x) < EPSILON, 'collision state reaches B');
  });

  test('8a: consented leave removes the player on server and peer', async (t) => {
    const [a, b] = await pair(t);
    const state = authority(b);
    await a.leave();
    await waitFor(() => !state.players.has(a.sessionId) && !b.state.players.has(a.sessionId), 'leave cleanup');
    assert.equal(state.players.size, 1);
  });

  test('8b: unexpected drop marks disconnected, stops input, and expires the player', async (t) => {
    const [a, b] = await pair(t);
    const state = authority(b);
    await sendSteps(a, { moveX: 1, moveY: 0, run: false }, 3);
    const lastPosition = point(player(state, a.sessionId));
    dropConnection(a);
    await waitFor(() => state.players.get(a.sessionId)?.connected === false, 'drop detected');
    await delay(150);
    assert.deepEqual(point(player(state, a.sessionId)), lastPosition, 'no movement from stale held input');
    await waitFor(() => !state.players.has(a.sessionId) && !b.state.players.has(a.sessionId), 'expired drop cleanup', 5_000);
    assert.equal(state.players.size, 1);
  });

  test('reconnect preserves the session, nickname, position, and input functionality', async (t) => {
    const [a, b] = await pair(t);
    const state = authority(b);
    await sendSteps(a, { moveX: 1, moveY: 0, run: false }, 4);
    const lastPosition = point(player(state, a.sessionId));
    const token = a.reconnectionToken;
    dropConnection(a);
    await waitFor(() => state.players.get(a.sessionId)?.connected === false, 'drop detected before reconnect');
    const rejoined: TestRoom = await new Client(url).reconnect<LabState>(token);
    rejoined.reconnection.enabled = false;
    t.after(() => closeRooms([rejoined]));
    await waitFor(() => rejoined.state.players?.has(a.sessionId) === true && player(state, a.sessionId).connected, 'reconnected state');
    assert.equal(rejoined.sessionId, a.sessionId);
    assert.equal(player(rejoined.state, rejoined.sessionId).nickname, 'Alice');
    assert.deepEqual(point(player(state, a.sessionId)), lastPosition);
    assert.equal(state.players.size, 2, 'reconnect does not duplicate the player');
    await sendSteps(rejoined, { moveX: 1, moveY: 0, run: false }, 3);
    assert.ok(player(state, a.sessionId).x > lastPosition.x);
  });

  test('9: extreme and nonfinite input axes cannot poison state or exceed speed', async (t) => {
    const [a, b] = await pair(t);
    const state = authority(a);
    const controlled = player(state, a.sessionId);
    Object.assign(controlled, { x: 64, y: 64 });
    await sendSteps(a, { moveX: 999, moveY: NaN, run: false }, 6);
    assert.ok(Number.isFinite(controlled.x) && Number.isFinite(controlled.y));
    assert.ok(Math.hypot(controlled.x - 64, controlled.y - 64) <= 6 * WALK_SPEED / SERVER_TICK_RATE + EPSILON);
    await sendSteps(a, { moveX: -Infinity, moveY: Infinity, run: false }, 3);
    assert.ok(Number.isFinite(controlled.x) && Number.isFinite(controlled.y));
    await waitFor(() => Number.isFinite(player(b.state, a.sessionId).x), 'peer state remains valid');
  });

  test('invalid run source values on the boolean wire remain finite and bounded by run speed', async (t) => {
    const [a] = await pair(t);
    const controlled = player(authority(a), a.sessionId);
    Object.assign(controlled, { x: 64, y: 64 });
    const input = movement(a);
    // The official schema encoder coerces these source values onto a boolean
    // wire field. The server can only see true/false, so it cannot recover the
    // original invalid type. This tests safety, not false claims of rejection.
    for (const run of ['false', 123]) {
      const start = point(controlled);
      Object.assign(input.data, { moveX: 1, moveY: 0, run });
      input.send();
      await waitFor(() => input.lastProcessed >= input.sentCount, 'invalid source run ack');
      assert.ok(Number.isFinite(controlled.x) && Number.isFinite(controlled.y));
      assert.ok(Math.hypot(controlled.x - start.x, controlled.y - start.y) <= RUN_SPEED / SERVER_TICK_RATE + EPSILON);
    }
  });

  test('10: arbitrary client x/y and unsupported position messages cannot inject authority', async (t) => {
    const [a, b] = await pair(t);
    const state = authority(a);
    const controlled = player(state, a.sessionId);
    const beforePosition = point(controlled);
    const input = movement(a);
    Object.assign(input.data, { moveX: 0, moveY: 0, run: false, x: 500_000, y: -50_000 });
    input.send();
    a.send('position', { x: 500_000, y: -50_000 });
    a.send('move', { x: 500_000, y: -50_000, run: 'invalid' });
    const tick = state.tick;
    await waitFor(() => state.tick >= tick + 5, 'server continued after forged commands');
    assert.deepEqual(point(controlled), beforePosition);
    assert.deepEqual(point(player(b.state, a.sessionId)), beforePosition);
  });

  test('input burst cannot exceed the total elapsed fixed-tick movement budget', async (t) => {
    const [a] = await pair(t);
    const state = authority(a);
    // Tick zero is also the schema's initial value before the first simulation.
    // Establish a completed tick before comparing exact elapsed step counts.
    await waitFor(() => state.tick > 0, 'first completed simulation ticks');
    const controlled = player(state, a.sessionId);
    Object.assign(controlled, { x: 64, y: 64 });
    const input = movement(a);
    Object.assign(input.data, { moveX: 1, moveY: 0, run: false });
    const startingTick = state.tick;
    for (let i = 0; i < 100; i += 1) input.send();
    await waitFor(() => state.tick >= startingTick + 6, 'six simulation steps after burst');
    const elapsedTicks = state.tick - startingTick;
    assert.ok(controlled.x > 64, 'valid burst input was processed');
    // The bounded catch-up path can repay credits from earlier empty ticks;
    // include every tick since room creation, rather than only the burst window.
    const maximumEarnedSteps = state.tick + 1;
    assert.ok(controlled.x - 64 <= maximumEarnedSteps * WALK_SPEED / SERVER_TICK_RATE + EPSILON,
      `burst is limited by server time: distance=${controlled.x - 64}, burst ticks=${elapsedTicks}, total budget=${maximumEarnedSteps}`);
  });

  test('short TCP-style input stalls recover backlog within the earned elapsed-time budget', async (t) => {
    const [a] = await pair(t);
    const state = authority(a);
    const controlled = player(state, a.sessionId);
    Object.assign(controlled, { x: 64, y: 64 });
    await sendSteps(a, { moveX: 1, moveY: 0, run: false }, 2);
    const startingPosition = point(controlled);
    const startingTick = state.tick;
    const input = movement(a);
    await waitFor(() => state.tick >= startingTick + 4, 'four simulated idle ticks for a short input stall');
    for (let i = 0; i < 4; i += 1) input.send();
    for (let i = 0; i < 10; i += 1) {
      await delay(1_000 / SERVER_TICK_RATE);
      input.send();
    }
    // Inspect the actual server queue while input is still arriving: merely
    // waiting after stopping would hide a persistent fixed-size queue delay.
    await delay(5);
    const serverRoom = matchMaker.getLocalRoomById(a.roomId) as LabRoom;
    assert.ok(serverRoom.inputs.get(a.sessionId).size <= 1, 'catch-up drains accumulated commands while movement continues');
    await waitFor(() => input.lastProcessed >= input.sentCount, 'all burst and paced inputs acknowledged');
    near(controlled.x - startingPosition.x, 14 * WALK_SPEED / SERVER_TICK_RATE, 'all commands simulate exactly once');
    assert.ok(controlled.x - startingPosition.x <= (state.tick - startingTick) * WALK_SPEED / SERVER_TICK_RATE + EPSILON,
      'catch-up cannot simulate time that did not elapse');
    assert.ok(a.connection.isOpen, 'a brief drained backlog does not force reconnection');
  });

  test('a persistent 700 ms TCP backlog triggers bounded resync and reconnect preserves identity', async (t) => {
    const [a, b] = await pair(t);
    const state = authority(b);
    const controlled = player(state, a.sessionId);
    Object.assign(controlled, { x: 64, y: 64 });
    await sendSteps(a, { moveX: 1, moveY: 0, run: false }, 2);
    const token = a.reconnectionToken;
    const input = movement(a);
    let closeCode: number | undefined;
    a.onLeave((code) => { closeCode = code; });
    // Deliver a burst that represents 700 ms of delayed input, then keep
    // transmitting at 30 Hz. Stopping the stream would conceal a permanent
    // FIFO delay because the server could eventually drain an idle queue.
    const delayedSteps = Math.ceil(0.7 * SERVER_TICK_RATE);
    const stallStart = state.tick;
    await waitFor(() => state.tick >= stallStart + delayedSteps, '700 ms input stall');
    for (let i = 0; i < delayedSteps; i += 1) input.send();
    const deadline = performance.now() + 5_000;
    while (a.connection.isOpen && performance.now() < deadline) {
      await delay(1_000 / SERVER_TICK_RATE);
      if (a.connection.isOpen) input.send();
    }
    assert.equal(a.connection.isOpen, false, 'persistent input delay is bounded by a resync');
    await waitFor(() => closeCode !== undefined && state.players.get(a.sessionId)?.connected === false, 'resync drop state');
    assert.equal(closeCode, CloseCode.MAY_TRY_RECONNECT, 'server signals recoverable resync');
    const resyncPosition = point(player(state, a.sessionId));
    const rejoined: TestRoom = await new Client(url).reconnect<LabState>(token);
    rejoined.reconnection.enabled = false;
    t.after(() => closeRooms([rejoined]));
    await waitFor(() => rejoined.state.players?.has(a.sessionId) === true && player(state, a.sessionId).connected, 'fresh resync state');
    assert.equal(rejoined.sessionId, a.sessionId);
    assert.equal(player(state, a.sessionId).nickname, 'Alice');
    assert.deepEqual(point(player(state, a.sessionId)), resyncPosition);
    assert.equal(state.players.size, 2);
    const freshInput = await sendSteps(rejoined, { moveX: 1, moveY: 0, run: false }, 6);
    near(player(state, a.sessionId).x - resyncPosition.x, 6 * WALK_SPEED / SERVER_TICK_RATE, 'stale inputs are discarded before fresh movement');
    assert.equal(freshInput.pendingCount, 0);
    await waitFor(() => Math.abs(player(b.state, a.sessionId).x - player(state, a.sessionId).x) < EPSILON, 'peer converges after resync');
    assert.ok(rejoined.connection.isOpen);
  });

  test('long idle cannot bank catch-up credit for a later speed burst', async (t) => {
    const [a] = await pair(t);
    const state = authority(a);
    const controlled = player(state, a.sessionId);
    Object.assign(controlled, { x: 64, y: 64 });
    await sendSteps(a, { moveX: 1, moveY: 0, run: false }, 2);
    const idleStartTick = state.tick;
    const expiryTicks = Math.ceil(CATCHUP_CREDIT_EXPIRY_MS * SERVER_TICK_RATE / 1_000) + 3;
    await waitFor(() => state.tick >= idleStartTick + expiryTicks, 'old catch-up credits expire');
    const startingPosition = point(controlled);
    const startingTick = state.tick;
    const input = movement(a);
    for (let i = 0; i < 12; i += 1) input.send();
    await waitFor(() => state.tick >= startingTick + 4, 'movement after long idle');
    assert.ok(controlled.x > startingPosition.x);
    assert.ok(controlled.x - startingPosition.x <= (state.tick - startingTick) * WALK_SPEED / SERVER_TICK_RATE + EPSILON,
      'expired idle credits do not permit double movement steps');
  });

  test('input flooding above the cap disconnects the sender and preserves the other player', async (t) => {
    const [a, b] = await pair(t);
    const state = authority(b);
    const input = movement(a);
    Object.assign(input.data, { moveX: 1, moveY: 0, run: true });
    for (let i = 0; i < MAX_MESSAGES_PER_SECOND + 40; i += 1) input.send();
    await waitFor(() => !a.connection.isOpen && !state.players.has(a.sessionId), 'flood sender rejected', 5_000);
    assert.equal(state.players.size, 1);
    assert.ok(b.connection.isOpen);
    assert.ok(Number.isFinite(player(state, b.sessionId).x));
  });

  for (const latencyMs of [0, 50, 100, 200]) {
    test(`latency ${latencyMs} ms added RTT: real peers converge without losing input`, async (t) => {
      server.server.simulateLatency(latencyMs);
      t.after(() => { server.server.simulateLatency(0); });
      const [a, b] = await pair(t);
      const state = authority(a);
      Object.assign(player(state, a.sessionId), { x: 64, y: 64 });
      const samples: number[] = [];
      for (let i = 0; i < 3; i += 1) samples.push(await ping(a));
      const sorted = [...samples].sort((left, right) => left - right);
      const median = sorted[1];
      assert.ok(median !== undefined && Number.isFinite(median) && median >= 0);
      if (latencyMs > 0) assert.ok(median >= latencyMs * 0.7, `injected RTT should be observable (${median.toFixed(1)} ms)`);
      const input = await sendSteps(a, { moveX: 1, moveY: 0, run: false }, 12);
      const expected = player(state, a.sessionId);
      near(expected.x, 64 + 12 * WALK_SPEED / SERVER_TICK_RATE, 'all input steps processed');
      await waitFor(() => [a, b].every((view) => Math.abs(player(view.state, a.sessionId).x - expected.x) < EPSILON), 'delayed peers converge');
      assert.equal(input.pendingCount, 0);
      t.diagnostic(`Injected added RTT ${latencyMs} ms; measured RTT samples ${samples.map((sample) => sample.toFixed(1)).join(', ')} ms. This is automated state convergence, not a human smoothness benchmark.`);
    });
  }
});
