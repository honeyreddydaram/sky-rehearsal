import {defineConfig} from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: /smoke\.spec\.mjs/,
  timeout: 30_000,
  // One retry in CI only: the software WebGL renderer used in headless CI has shown
  // occasional unrelated flakiness under GPU stall (see tests/smoke.spec.mjs's Pilot
  // view test comment) -- this absorbs that without masking a real, reproducible
  // failure, which wouldn't go away on retry.
  retries: process.env.CI ? 1 : 0,
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://localhost:4173/index.html',
    reuseExistingServer: false,
  },
  use: {
    baseURL: 'http://localhost:4173',
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
    },
  },
});
