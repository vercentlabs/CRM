// Shared ESLint config for the API, worker and packages.
// apps/web keeps its own Next.js config; apps/mobile is linted here with React Hooks rules.
import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig([
  globalIgnores([
    '**/node_modules/**',
    '**/dist/**',
    '**/.next/**',
    '**/.turbo/**',
    '**/coverage/**',
    'apps/web/**',
    'apps/mobile/.expo/**',
    'apps/mobile/android/**',
    'apps/mobile/ios/**',
  ]),
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      'no-console': 'off',
    },
  },
  {
    // Pre-Phase-1 JavaScript. Findings are warnings so they stay visible without
    // blocking CI; files graduate to the strict rules as Phase 3 migrates them to TS.
    files: ['apps/api/src/**/*.js', 'apps/api/*.js', 'packages/database/legacy/**/*.js'],
    rules: {
      '@typescript-eslint/no-unused-vars': 'warn',
      'no-unused-vars': 'warn',
      'no-useless-escape': 'warn',
      'no-empty': 'warn',
      'no-case-declarations': 'warn',
      'no-prototype-builtins': 'warn',
      'no-async-promise-executor': 'warn',
    },
  },
  {
    files: ['apps/mobile/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    languageOptions: { globals: { ...globals.browser, __DEV__: 'readonly' } },
    rules: {
      ...reactHooks.configs.recommended.rules,
    },
  },
  {
    files: ['apps/mobile/*.js'],
    languageOptions: { sourceType: 'commonjs', globals: { ...globals.node } },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  {
    files: ['apps/mobile/test/**', 'apps/mobile/**/*.test.{ts,tsx}'],
    languageOptions: { globals: { ...globals.jest, ...globals.node } },
    rules: {
      // jest.mock factories must require lazily; probe components capture hook values for assertions.
      '@typescript-eslint/no-require-imports': 'off',
      'react-hooks/globals': 'off',
    },
  },
]);
