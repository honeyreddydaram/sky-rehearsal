import {defineConfig} from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: /.*\.spec\.mjs/,
  timeout: 30_000,
  webServer: {
    command: 'node tests/static-server.mjs',
    url: 'http://localhost:4173/index.html',
    reuseExistingServer: !process.env.CI,
  },
  use: {baseURL: 'http://localhost:4173'},
});
