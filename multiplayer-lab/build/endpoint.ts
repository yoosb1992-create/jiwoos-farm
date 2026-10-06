import { isIP } from 'node:net';

const PRIVATE_HOST_SUFFIXES = ['.localhost', '.local', '.internal', '.lan', '.home', '.home.arpa'];

/** Build-time policy only. DNS is not resolved: .invalid is useful for CI builds. */
export function productionEndpoint(value: string | undefined): string {
  const endpoint = value?.trim();
  if (!endpoint) throw new Error('Set VITE_MULTIPLAYER_SERVER_URL before building the production client');
  if (!/^wss:\/\/[^/?#\\\s]+\/?$/i.test(endpoint)) {
    throw new Error('Production client requires a root wss:// DNS endpoint without path, query or fragment');
  }
  let url: URL;
  try { url = new URL(endpoint); }
  catch { throw new Error('VITE_MULTIPLAYER_SERVER_URL is not a valid WebSocket URL'); }
  if (url.username || url.password) throw new Error('Production endpoint must not contain credentials');
  const hostname = url.hostname.toLowerCase();
  const unbracketed = hostname.replace(/^\[|\]$/g, '');
  const labels = hostname.split('.');
  if (isIP(unbracketed) !== 0 || labels.length < 2 || hostname.length > 253 ||
      hostname === 'localhost' || PRIVATE_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix)) ||
      labels.some((label) => label.length > 63 || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label))) {
    throw new Error('Production endpoint requires a public DNS hostname; IP literals and local hostnames are forbidden');
  }
  return url.toString().replace(/\/$/, '');
}

function privateAddress(address: string): boolean {
  const unbracketed = address.replace(/^\[|\]$/g, '').toLowerCase();
  if (isIP(unbracketed) === 4) {
    const [a = -1, b = -1] = unbracketed.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127);
  }
  if (isIP(unbracketed) === 6) {
    return unbracketed === '::' || unbracketed === '::1' ||
      /^(?:fc|fd|fe[89ab])/.test(unbracketed) || /^::ffff:(?:7f|a00|c0a8)/.test(unbracketed);
  }
  return false;
}

/** Inspect emitted text, not arbitrary decimal constants in graphics libraries. */
export function assertPublicBundleText(source: string, filename: string): void {
  if (/(?:^|[^a-z0-9_-])localhost(?:$|[^a-z0-9_-])/i.test(source)) {
    throw new Error(`Production bundle ${filename} contains a localhost reference`);
  }
  // Four complete IPv4 octets avoid interpreting Phaser versions/float values
  // as addresses. Boundaries also reject only complete literal addresses.
  for (const match of source.matchAll(/(?<![a-z0-9_.])(?:\d{1,3}\.){3}\d{1,3}(?![a-z0-9_.])/gi)) {
    if (privateAddress(match[0])) throw new Error(`Production bundle ${filename} contains a private/loopback IP literal`);
  }
  for (const match of source.matchAll(/\[[a-f0-9:.]+\]/gi)) {
    if (privateAddress(match[0])) throw new Error(`Production bundle ${filename} contains a private/loopback IPv6 literal`);
  }
}
