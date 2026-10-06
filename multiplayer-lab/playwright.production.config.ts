import { defineConfig } from '@playwright/test';

/**
 * Run after a production build with
 * VITE_MULTIPLAYER_SERVER_URL=wss://lab-validation.invalid.
 * The test forwards that reserved endpoint to local, compiled services. This
 * verifies deployment artifacts and endpoint selection, not public TLS/DNS.
 */
export default defineConfig({
  testDir: './tests',
  testMatch: 'deployment-browser.spec.ts',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  workers: 1,
  retries: 0,
  reporter: 'list',
  outputDir: 'test-results-production',
  use: {
    baseURL: 'http://127.0.0.1:5176',
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: {
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
      command: 'npm start',
      url: 'http://127.0.0.1:2571/healthz',
      env: {
        PORT: '2571', HOST: '127.0.0.1', NODE_ENV: 'production',
        CLIENT_ORIGINS: 'http://127.0.0.1:5176', LAB_LATENCY_MS: '200',
      },
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: 'npm run start:client',
      url: 'http://127.0.0.1:5176/healthz',
      env: { PORT: '5176', NODE_ENV: 'production' },
      reuseExistingServer: false,
      timeout: 30_000,
    },
  ],
});
