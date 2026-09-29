// Deterministic, non-secret environment for tests. SDK clients (ImageKit, Plivo)
// are constructed at import time, so placeholders must exist before app.js loads.
// DATABASE_URL points at a closed port unless TEST_DATABASE_URL provides a real database.
const defaults: Record<string, string> = {
  NODE_ENV: 'test',
  DATABASE_URL: process.env.TEST_DATABASE_URL ?? 'postgresql://crm:crm@127.0.0.1:1/crm_test',
  JWT_SECRET: 'test-only-jwt-secret-not-used-anywhere-else',
  STORAGE_PROVIDER: 'memory',
  IMAGEKIT_PUBLIC_KEY: 'test',
  IMAGEKIT_PRIVATE_KEY: 'test',
  IMAGEKIT_URL_ENDPOINT: 'https://ik.imagekit.io/test',
  PLIVO_AUTH_ID: 'test',
  PLIVO_AUTH_TOKEN: 'test-plivo-auth-token',
  PLIVO_WEBHOOK_URL: 'https://api.example.test/api/plivo/webhook',
  // Integration suites log in many times; the limiter itself is unit-tested separately.
  AUTH_RATE_LIMIT_MAX: '1000',
  AUTH_RATE_LIMIT_IP_MAX: '100000',
  SENSITIVE_RATE_LIMIT_PER_MINUTE: '100000',
  CORS_ORIGINS: 'http://web.example.test',
  // Fixed, test-only 32-byte key (hex) for webhook secret encryption.
  WEBHOOK_SECRET_KEY: '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff',
};

for (const [key, value] of Object.entries(defaults)) {
  process.env[key] = value;
}
