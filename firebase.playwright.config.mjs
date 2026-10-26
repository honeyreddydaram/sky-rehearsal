import base from './playwright.config.mjs';
export default {
  ...base,
  workers: 1,
  expect: {timeout: 15000},
  testMatch: /(accounts|school)\.spec\.mjs/,
  webServer: [
    {
      command:
        'uv run --project backend --frozen uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8001',
      url: 'http://127.0.0.1:8001/api/health',
      reuseExistingServer: false,
      env: {
        APP_ENV: 'development',
        FIREBASE_PROJECT_ID: 'demo-sky-rehearsal',
        FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
        FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
        FIREBASE_STORAGE_EMULATOR_HOST: '127.0.0.1:9199',
      },
    },
    {
      command: 'npm run dev -- --host 127.0.0.1 --port 4174 --strictPort',
      url: 'http://127.0.0.1:4174',
      reuseExistingServer: false,
      env: {
        VITE_FIREBASE_EMULATORS: 'true',
        VITE_FIREBASE_PROJECT_ID: 'demo-sky-rehearsal',
        SKY_API_ORIGIN: 'http://127.0.0.1:8001',
      },
    },
  ],
  use: {...base.use, baseURL: 'http://127.0.0.1:4174'},
};
