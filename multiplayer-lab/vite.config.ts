import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const endpoint = process.env.VITE_MULTIPLAYER_SERVER_URL ?? env.VITE_MULTIPLAYER_SERVER_URL;
  if (endpoint) {
    const url = new URL(endpoint);
    if (!['ws:', 'wss:'].includes(url.protocol)) {
      throw new Error('VITE_MULTIPLAYER_SERVER_URL must use ws:// or wss://');
    }
    if (mode === 'production' && url.protocol !== 'wss:') {
      throw new Error('Production client requires a wss:// multiplayer endpoint');
    }
  } else if (mode === 'production') {
    throw new Error('Set VITE_MULTIPLAYER_SERVER_URL before building the production client');
  }
  return {
    server: { host: '0.0.0.0', port: 5173, strictPort: true },
    preview: { host: '0.0.0.0', port: 4173, strictPort: true },
    build: {
      outDir: 'dist/client', emptyOutDir: true,
      rollupOptions: { output: { manualChunks: (id: string) => id.includes('/node_modules/phaser/') ? 'phaser' : undefined } },
    },
  };
});
