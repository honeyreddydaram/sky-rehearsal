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
    // The test file runs under Node via `npm test`, not in the browser.
    files: ['core.test.mjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
  },
];
