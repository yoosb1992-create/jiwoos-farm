import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { assertPublicBundleText, productionEndpoint } from '../build/endpoint.js';
import { assertReviewedSdkVersion, transformSdkFallback } from '../build/publicEndpointPlugin.js';

test('production endpoint accepts public WSS DNS hosts and a reserved CI hostname', () => {
  assert.equal(productionEndpoint(' wss://lab.example.com/ '), 'wss://lab.example.com');
  assert.equal(productionEndpoint('wss://lab.example.com:443'), 'wss://lab.example.com');
  assert.equal(productionEndpoint('wss://lab-validation.invalid:8443'), 'wss://lab-validation.invalid:8443');
});

test('production endpoint rejects local and IP-literal destinations including alternate loopback forms', () => {
  for (const value of [
    undefined, '', 'ws://lab.example.com', 'https://lab.example.com', 'wss://localhost', 'wss://sub.localhost',
    'wss://127.0.0.1', 'wss://127.1', 'wss://2130706433', 'wss://0x7f000001', 'wss://0.0.0.0',
    'wss://10.0.0.1', 'wss://172.16.0.1', 'wss://192.168.0.1', 'wss://8.8.8.8',
    'wss://[::1]', 'wss://[2001:4860:4860::8888]', 'wss://my-computer', 'wss://farm.local',
    'wss://farm.internal', 'wss://farm.lan', 'wss://farm.home.arpa', 'wss://lab.example.com.',
    'wss://lab..example.com', 'wss://-lab.example.com', 'wss://lab_.example.com',
  ]) assert.throws(() => productionEndpoint(value), Error, String(value));
});

test('production endpoint forbids credentials, paths, query and fragments instead of normalizing them away', () => {
  for (const value of [
    'wss://user:password@lab.example.com', 'wss://user@lab.example.com', 'wss://lab.example.com/path',
    'wss://lab.example.com/..', 'wss://lab.example.com/%2e%2e', 'wss://lab.example.com//',
    'wss://lab.example.com?', 'wss://lab.example.com/?token=value', 'wss://lab.example.com#fragment',
    'wss://lab.example.com\\path', 'wss://lab.example.com:99999',
  ]) assert.throws(() => productionEndpoint(value), Error, value);
});

test('bundle guard catches actual local destinations without treating graphics numbers as IP addresses', () => {
  for (const source of [
    '"localhost"', '`ws://127.0.0.1:2567`', '"http://192.168.20.1"', '"10.1.2.3"',
    '"172.31.4.5"', '"169.254.1.2"', '"100.64.0.1"', '"[::1]"', '"wss://[fd12::1]"',
  ]) assert.throws(() => assertPublicBundleText(source, 'fixture.js'));
  for (const source of ['const n=127.5; const version="3.90.0";', 'const n=192.168;', '"172.15.4.5"', '"lab-validation.invalid"']) {
    assert.doesNotThrow(() => assertPublicBundleText(source, 'fixture.js'));
  }
});

test('production transform rewrites only the two exact installed pinned SDK fallback sites', () => {
  const require = createRequire(import.meta.url);
  const sdkRoot = dirname(require.resolve('@colyseus/sdk/package.json'));
  const endpoint = 'wss://lab-validation.invalid';
  for (const module of ['Client.mjs', '3rd_party/discord.mjs']) {
    const path = join(sdkRoot, 'build', module);
    const original = readFileSync(path, 'utf8');
    const rewritten = transformSdkFallback(original, path, endpoint);
    assert.notEqual(rewritten, null);
    assert.doesNotThrow(() => assertPublicBundleText(rewritten!, module));
    assert.equal(readFileSync(path, 'utf8'), original, 'installed SDK files remain unchanged');
    assert.throws(() => transformSdkFallback(rewritten!, path, endpoint), /fallback changed/);
    assert.equal(transformSdkFallback(original, '/app/client/Client.mjs', endpoint), null);
  }
  assert.doesNotThrow(() => assertReviewedSdkVersion('0.18.5'));
  assert.throws(() => assertReviewedSdkVersion('0.18.6'), /Review production endpoint transform/);
});
