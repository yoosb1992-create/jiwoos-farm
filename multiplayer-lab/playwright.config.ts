import { defineConfig } from '@playwright/test';

/** Isolated ports, real browser + real Colyseus server, 200 ms added RTT. */
export default defineConfig({
  testDir: './tests/browser',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:5174',
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: {
      // Optional system/browser-runtime binary. CI uses Playwright's Chromium.
      ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
        ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
        : {}),
      args: [
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--enable-unsafe-swiftshader',
      ],
    },
  },
  webServer: [
    {
      command: 'npm run dev:server',
      url: 'http://127.0.0.1:2569/healthz',
      env: { PORT: '2569', NODE_ENV: 'development', LAB_LATENCY_MS: '200' },
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: 'npm run dev:client -- --host 127.0.0.1 --port 5174',
      url: 'http://127.0.0.1:5174',
      env: { VITE_MULTIPLAYER_SERVER_URL: 'ws://127.0.0.1:2569' },
      reuseExistingServer: false,
      timeout: 30_000,
    },
  ],
});
