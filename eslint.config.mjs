// Shared ESLint config for the API, worker and packages.
// apps/web keeps its own Next.js config; apps/mobile is type-checked only (for now).
import js from '@eslint/js';
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
    'apps/mobile/**',
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
]);
