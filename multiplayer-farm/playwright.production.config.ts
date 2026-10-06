import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  testMatch: "production-browser.spec.ts",
  timeout: 60000,
  retries: 0,
  workers: 1,
  outputDir: "test-results-production",
  use: {
    baseURL: "http://127.0.0.1:4175",
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
      args: [
        "--no-sandbox",
        "--disable-dev-shm-usage",
        "--enable-unsafe-swiftshader",
        "--disable-background-timer-throttling",
        "--disable-renderer-backgrounding",
      ],
    },
  },
  webServer: [
    {
      command: "npm start",
      url: "http://127.0.0.1:2575/healthz",
      env: {
        PORT: "2575",
        HOST: "127.0.0.1",
        NODE_ENV: "production",
        CLIENT_ORIGINS: "http://127.0.0.1:4175",
      },
      reuseExistingServer: false,
    },
    {
      command: "npm run start:client",
      url: "http://127.0.0.1:4175/healthz",
      env: { PORT: "4175", NODE_ENV: "production" },
      reuseExistingServer: false,
    },
  ],
});
