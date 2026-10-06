import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyMovement, sanitizeMovementInput } from '../shared/applyMovement.js';
import {
  MAP_HEIGHT, MAP_WIDTH, MAX_MOVEMENT_SUBSTEP, OBSTACLES, PATCH_RATE, PLAYER_RADIUS,
  RUN_SPEED, SERVER_TICK_RATE, WALK_SPEED,
} from '../shared/config.js';

const DT = 1 / SERVER_TICK_RATE;
const EPSILON = 1e-8;
const near = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < EPSILON, `${actual} ≈ ${expected}`);

test('movement configuration has usable rates, speeds, and map dimensions', () => {
  assert.equal(SERVER_TICK_RATE, 30);
  assert.ok(PATCH_RATE > 0 && PATCH_RATE <= SERVER_TICK_RATE);
  assert.ok(WALK_SPEED > 0 && RUN_SPEED > WALK_SPEED);
  assert.ok(MAP_WIDTH > PLAYER_RADIUS * 2 && MAP_HEIGHT > PLAYER_RADIUS * 2);
  assert.ok(OBSTACLES.length >= 2, 'the lab has multiple collision obstacles');
});

test('shared movement is deterministic across two independent simulations', () => {
  const first = { x: 64, y: 64 };
  const second = { ...first };
  let seed = 7256;
  for (let i = 0; i < 3_000; i += 1) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const input = { moveX: ((seed >>> 3) % 3) - 1, moveY: ((seed >>> 7) % 3) - 1, run: (seed & 1) === 1 };
    applyMovement(first, input, DT);
    applyMovement(second, input, DT);
    assert.deepEqual(first, second);
    assert.ok(Number.isFinite(first.x) && Number.isFinite(first.y));
  }
});

test('walking and running use their configured speeds', () => {
  const walk = { x: 64, y: 64 };
  const run = { ...walk };
  applyMovement(walk, { moveX: 1, moveY: 0, run: false }, DT);
  applyMovement(run, { moveX: 1, moveY: 0, run: true }, DT);
  near(walk.x - 64, WALK_SPEED * DT);
  near(run.x - 64, RUN_SPEED * DT);
  assert.ok(run.x > walk.x);
});

test('diagonal speed equals straight speed; analog inputs retain magnitude', () => {
  for (const run of [false, true]) {
    const diagonal = { x: 64, y: 64 };
    const straight = { ...diagonal };
    const analog = { ...diagonal };
    applyMovement(diagonal, { moveX: 1, moveY: 1, run }, DT);
    applyMovement(straight, { moveX: 1, moveY: 0, run }, DT);
    applyMovement(analog, { moveX: 0.5, moveY: 0, run }, DT);
    near(Math.hypot(diagonal.x - 64, diagonal.y - 64), straight.x - 64);
    near(analog.x - 64, (straight.x - 64) / 2);
  }
});

test('all map edges constrain the entire player footprint', () => {
  for (const input of [
    { moveX: -1, moveY: -1, run: true },
    { moveX: 1, moveY: 1, run: true },
  ]) {
    const position = input.moveX < 0
      ? { x: PLAYER_RADIUS + 1, y: PLAYER_RADIUS + 1 }
      : { x: MAP_WIDTH - PLAYER_RADIUS - 1, y: MAP_HEIGHT - PLAYER_RADIUS - 1 };
    for (let i = 0; i < 30; i += 1) applyMovement(position, input, DT);
    near(position.x, input.moveX < 0 ? PLAYER_RADIUS : MAP_WIDTH - PLAYER_RADIUS);
    near(position.y, input.moveY < 0 ? PLAYER_RADIUS : MAP_HEIGHT - PLAYER_RADIUS);
  }
});

test('obstacles stop movement from all four sides without penetration', () => {
  const obstacle = OBSTACLES[0];
  assert.ok(obstacle);
  const cases = [
    { start: { x: obstacle.x - PLAYER_RADIUS - 1, y: obstacle.y + obstacle.height / 2 }, input: { moveX: 1, moveY: 0, run: true }, axis: 'x' as const, boundary: obstacle.x - PLAYER_RADIUS },
    { start: { x: obstacle.x + obstacle.width + PLAYER_RADIUS + 1, y: obstacle.y + obstacle.height / 2 }, input: { moveX: -1, moveY: 0, run: true }, axis: 'x' as const, boundary: obstacle.x + obstacle.width + PLAYER_RADIUS },
    { start: { x: obstacle.x + obstacle.width / 2, y: obstacle.y - PLAYER_RADIUS - 1 }, input: { moveX: 0, moveY: 1, run: true }, axis: 'y' as const, boundary: obstacle.y - PLAYER_RADIUS },
    { start: { x: obstacle.x + obstacle.width / 2, y: obstacle.y + obstacle.height + PLAYER_RADIUS + 1 }, input: { moveX: 0, moveY: -1, run: true }, axis: 'y' as const, boundary: obstacle.y + obstacle.height + PLAYER_RADIUS },
  ];
  for (const sample of cases) {
    for (let i = 0; i < 60; i += 1) applyMovement(sample.start, sample.input, DT);
    const offset = sample.start[sample.axis] - sample.boundary;
    assert.ok(Math.abs(offset) <= MAX_MOVEMENT_SUBSTEP, 'player stops within one conservative collision substep');
    const direction = sample.axis === 'x' ? sample.input.moveX : sample.input.moveY;
    assert.ok(offset * direction <= 0, 'player never penetrates the obstacle');
  }
});

test('diagonal movement slides along a wall without entering it', () => {
  const obstacle = OBSTACLES[0];
  assert.ok(obstacle);
  const position = { x: obstacle.x - PLAYER_RADIUS, y: obstacle.y + obstacle.height / 2 };
  const initialY = position.y;
  applyMovement(position, { moveX: 1, moveY: 1, run: false }, DT);
  near(position.x, obstacle.x - PLAYER_RADIUS);
  assert.ok(position.y > initialY);
});

test('untrusted input sanitization rejects malformed types and nonfinite axes', () => {
  for (const input of [null, undefined, false, 'move', 42, [], { moveX: NaN, moveY: Infinity, run: 'yes' }]) {
    assert.deepEqual(sanitizeMovementInput(input), { moveX: 0, moveY: 0, run: false });
  }
  for (const run of [1, -1, 'true', {}, []]) {
    assert.equal(sanitizeMovementInput({ moveX: 0, moveY: 0, run }).run, false);
  }
  const bounded = sanitizeMovementInput({ moveX: 999, moveY: -999, run: true, x: 500_000, y: -10 });
  assert.ok(Math.abs(bounded.moveX) <= 1 && Math.abs(bounded.moveY) <= 1);
  assert.equal(bounded.run, true);
  assert.deepEqual(Object.keys(bounded).sort(), ['moveX', 'moveY', 'run']);
  assert.deepEqual(sanitizeMovementInput({ moveX: '1', moveY: null, run: false }), { moveX: 0, moveY: 0, run: false });
});

test('zero, negative, and nonfinite timesteps do not move or poison position', () => {
  for (const dt of [0, -1, NaN, Infinity, -Infinity]) {
    const position = { x: 64, y: 64 };
    applyMovement(position, { moveX: 1, moveY: 1, run: true }, dt);
    assert.deepEqual(position, { x: 64, y: 64 });
  }
});
