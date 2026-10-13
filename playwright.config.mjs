import {defineConfig} from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: /.*\.spec\.mjs/,
  timeout: 30_000,
  // One retry in CI only: the software WebGL renderer used in headless CI has shown
  // occasional unrelated flakiness under GPU stall (see tests/smoke.spec.mjs's Pilot
  // view test comment) -- this absorbs that without masking a real, reproducible
  // failure, which wouldn't go away on retry.
  retries: process.env.CI ? 1 : 0,
  webServer: {
    command: 'node tests/static-server.mjs',
    url: 'http://localhost:4173/index.html',
    reuseExistingServer: !process.env.CI,
  },
  use: {baseURL: 'http://localhost:4173'},
});
