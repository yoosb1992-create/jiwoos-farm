import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createLabServer } from '../server/createLabServer.js';

test('development latency accepts only the explicit lab presets', () => {
  for (const latencyMs of [-1, 51, 999, NaN, Infinity]) {
    assert.throws(() => createLabServer({ production: false, latencyMs }), /LAB_LATENCY_MS/);
  }
});

test('server rejects a hidden framework latency environment override', () => {
  const original = process.env.COLYSEUS_LATENCY;
  try {
    for (const value of ['50', '200', '-10', 'invalid']) {
      process.env.COLYSEUS_LATENCY = value;
      assert.throws(() => createLabServer({ production: true, clientOrigins: ['https://lab.example'] }), /COLYSEUS_LATENCY/);
    }
  } finally {
    if (original === undefined) delete process.env.COLYSEUS_LATENCY;
    else process.env.COLYSEUS_LATENCY = original;
  }
});

test('production requires explicit exact HTTP origins', () => {
  assert.throws(() => createLabServer({ production: true }), /CLIENT_ORIGINS/);
  for (const origin of ['*', 'https://lab.example/path', 'ws://lab.example', 'https://lab.example/']) {
    assert.throws(() => createLabServer({ production: true, clientOrigins: [origin] }));
  }
});

test('reconnection grace is bounded server configuration', () => {
  for (const reconnectionSeconds of [-1, 121, NaN, Infinity]) {
    assert.throws(() => createLabServer({ production: false, reconnectionSeconds }), /reconnection grace/);
  }
});
