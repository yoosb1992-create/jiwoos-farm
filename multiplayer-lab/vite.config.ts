import { defineConfig, loadEnv } from 'vite';
import { productionEndpoint } from './build/endpoint.js';
import { publicEndpointPlugin } from './build/publicEndpointPlugin.js';

export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const configured = process.env.VITE_MULTIPLAYER_SERVER_URL ?? env.VITE_MULTIPLAYER_SERVER_URL;
  // Every generated static build has the production guard, including custom
  // --mode names. Development server/LAN testing retains its ws:// support.
  const endpoint = command === 'build' ? productionEndpoint(configured) : configured;
  if (command !== 'build' && endpoint) {
    const url = new URL(endpoint);
    if (!['ws:', 'wss:'].includes(url.protocol)) {
      throw new Error('VITE_MULTIPLAYER_SERVER_URL must use ws:// or wss://');
    }
  }
  return {
    plugins: command === 'build' && endpoint ? [publicEndpointPlugin(endpoint)] : [],
    server: { host: '0.0.0.0', port: 5173, strictPort: true },
    preview: { host: '0.0.0.0', port: 4173, strictPort: true },
    build: {
      outDir: 'dist/client', emptyOutDir: true,
      rollupOptions: { output: { manualChunks: (id: string) => id.includes('/node_modules/phaser/') ? 'phaser' : undefined } },
    },
  };
});
