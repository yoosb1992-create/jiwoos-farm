import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import type { Plugin } from 'vite';
import { assertPublicBundleText, productionEndpoint } from './endpoint.js';

export const REVIEWED_SDK_VERSION = '0.18.5';
const CLIENT_SUFFIX = '/node_modules/@colyseus/sdk/build/Client.mjs';
const DISCORD_SUFFIX = '/node_modules/@colyseus/sdk/build/3rd_party/discord.mjs';
const CLIENT_FALLBACK = ': "ws://127.0.0.1:2567";';
const DISCORD_FALLBACK = 'const localHostname = window?.location?.hostname || "localhost";';

export function assertReviewedSdkVersion(version: unknown): void {
  if (version !== REVIEWED_SDK_VERSION) {
    throw new Error(`Review production endpoint transform before changing @colyseus/sdk ${REVIEWED_SDK_VERSION}`);
  }
}

/** Narrow in-memory rewrite of two unused SDK defaults. Never edits node_modules. */
export function transformSdkFallback(source: string, id: string, endpoint: string): string | null {
  const path = id.replaceAll('\\', '/').split('?')[0] ?? '';
  const replacement = path.endsWith(CLIENT_SUFFIX)
    ? { expected: CLIENT_FALLBACK, value: `: ${JSON.stringify(endpoint)};` }
    : path.endsWith(DISCORD_SUFFIX)
      ? { expected: DISCORD_FALLBACK, value: `const localHostname = window?.location?.hostname || ${JSON.stringify(new URL(endpoint).hostname)};` }
      : undefined;
  if (!replacement) return null;
  if (source.split(replacement.expected).length !== 2) {
    throw new Error(`Pinned SDK fallback changed in ${path}; review the production transform`);
  }
  return source.replace(replacement.expected, replacement.value);
}

export function publicEndpointPlugin(configured: string): Plugin {
  const endpoint = productionEndpoint(configured);
  const require = createRequire(import.meta.url);
  const metadata: unknown = JSON.parse(readFileSync(require.resolve('@colyseus/sdk/package.json'), 'utf8'));
  assertReviewedSdkVersion(metadata !== null && typeof metadata === 'object' && 'version' in metadata ? metadata.version : undefined);
  const transformed = new Set<string>();
  return {
    name: 'lab-production-public-endpoint',
    apply: 'build',
    enforce: 'pre',
    transform(source, id) {
      const code = transformSdkFallback(source, id, endpoint);
      if (code === null) return null;
      transformed.add(id.replaceAll('\\', '/').split('?')[0] ?? id);
      return { code, map: null };
    },
    generateBundle(_options, bundle) {
      if (![CLIENT_SUFFIX, DISCORD_SUFFIX].every((suffix) => [...transformed].some((path) => path.endsWith(suffix)))) {
        throw new Error('Production SDK endpoint transform did not visit both pinned modules');
      }
      for (const item of Object.values(bundle)) {
        if (item.type === 'chunk') {
          assertPublicBundleText(item.code, item.fileName);
        } else if (/\.(?:html|css|json|map|js|mjs)$/i.test(item.fileName)) {
          const source = typeof item.source === 'string' ? item.source : new TextDecoder().decode(item.source);
          assertPublicBundleText(source, item.fileName);
        }
      }
    },
  };
}
