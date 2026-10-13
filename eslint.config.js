import js from '@eslint/js';
import globals from 'globals';
import prettier from 'eslint-config-prettier';

export default [
  js.configs.recommended,
  prettier,
  {
    ignores: ['node_modules/**'],
  },
  {
    // Browser-facing modules: app.js, state.js, ui.js, map.js, playback.js, quiz.js,
    // progress.js, settings.js, core.mjs.
    files: ['*.js', '*.mjs'],
    ignores: ['core.test.mjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
      },
    },
    rules: {
      'no-unused-vars': ['warn', {argsIgnorePattern: '^_'}],
    },
  },
  {
    // Test files and config run under Node via `npm test`/`npm run test:e2e`, not in
    // the browser. tests/smoke.spec.mjs executes in Node too (it drives a browser via
    // Playwright, but the test file itself is a Node script).
    files: ['core.test.mjs', 'tests/**/*.mjs', 'playwright.config.mjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
  },
];
