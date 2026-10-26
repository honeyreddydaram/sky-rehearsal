import base from './playwright.config.mjs';
export default {
  ...base,
  testMatch: /accounts\.spec\.mjs/,
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4174 --strictPort',
    url: 'http://127.0.0.1:4174',
    reuseExistingServer: false,
    env: {VITE_FIREBASE_EMULATORS: 'true', VITE_FIREBASE_PROJECT_ID: 'demo-sky-rehearsal'},
  },
  use: {...base.use, baseURL: 'http://127.0.0.1:4174'},
};
