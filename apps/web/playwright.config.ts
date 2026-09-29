import { defineConfig, devices } from '@playwright/test';

/**
 * Critical-path browser tests against the real API and a disposable
 * PostgreSQL database (E2E_DATABASE_URL, which is migrated and seeded by
 * e2e/global-setup.ts). Build the API first (`pnpm --filter @crm/api build`).
 * Run: `E2E_DATABASE_URL=postgres://… pnpm --filter @crm/web test:e2e`.
 */

const WEB_PORT = 3100;
const API_PORT = 4100;
export const WEB_URL = `http://localhost:${WEB_PORT}`;
export const API_URL = `http://localhost:${API_PORT}`;

const databaseUrl = process.env.E2E_DATABASE_URL ?? '';

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL: WEB_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'node ../api/dist/server.js',
      url: `${API_URL}/api/v1/health/ready`,
      reuseExistingServer: false,
      timeout: 60_000,
      // Development mode: the E2E stack runs over plain http://localhost, which the
      // production startup guards (Secure cookies, https origins, Redis, DB TLS)
      // rightly refuse. Production-mode behaviour is covered by
      // apps/api/test/production-config.test.ts and scripts/smoke-api.mjs.
      env: {
        NODE_ENV: 'development',
        LOG_FORMAT: 'json',
        LOG_LEVEL: 'warn',
        PORT: String(API_PORT),
        DATABASE_URL: databaseUrl,
        JWT_SECRET: 'e2e-only-secret-0123456789abcdef0123456789abcdef',
        CORS_ORIGINS: WEB_URL,
        FRONTEND_URL: WEB_URL,
        AUTH_RATE_LIMIT_MAX: '1000',
        IMAGEKIT_PUBLIC_KEY: 'e2e',
        IMAGEKIT_PRIVATE_KEY: 'e2e',
        IMAGEKIT_URL_ENDPOINT: 'https://ik.imagekit.io/e2e',
        PLIVO_AUTH_ID: 'e2e',
        PLIVO_AUTH_TOKEN: 'e2e',
        // Test-only key: webhook management is disabled without one.
        WEBHOOK_SECRET_KEY: 'e2e0e2e0e2e0e2e0e2e0e2e0e2e0e2e0e2e0e2e0e2e0e2e0e2e0e2e0e2e0e2e0',
      },
    },
    {
      // NEXT_PUBLIC_* values are inlined at build time, so the app is built for the test API.
      command: `npx next build && npx next start -p ${WEB_PORT}`,
      url: `${WEB_URL}/login`,
      reuseExistingServer: false,
      timeout: 240_000,
      env: { NEXT_PUBLIC_API_BASE_URL: API_URL },
    },
  ],
});
