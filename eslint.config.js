import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {ignores: ['node_modules/**', 'dist/**', 'public/cesium/**', 'test-results/**', 'playwright-report/**']},
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    files: ['**/*.{js,mjs,ts,tsx}'],
    languageOptions: {globals: {...globals.browser, ...globals.node}},
    rules: {
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', {argsIgnorePattern: '^_'}],
    },
  },
);
