import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser",
  timeout: 45000,
  retries: 0,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:5175",
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
      command: "node --import tsx tests/run-server.ts",
      url: "http://127.0.0.1:2575/healthz",
      reuseExistingServer: false,
    },
    {
      command:
        "VITE_MULTIPLAYER_SERVER_URL=ws://127.0.0.1:2575 npm run dev:client -- --port 5175 --host 127.0.0.1",
      url: "http://127.0.0.1:5175",
      reuseExistingServer: false,
    },
  ],
});
