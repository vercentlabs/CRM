#!/usr/bin/env node
/**
 * Post-deploy API smoke test (no dependencies). Exit code 0 = healthy.
 *
 *   API_URL=https://api.example.com [SMOKE_EMAIL=… SMOKE_PASSWORD=…] \
 *   [EXPECT_VERSION=1.4.0] [WEB_ORIGIN=https://app.example.com] node scripts/smoke-api.mjs
 *
 * Checks liveness, readiness (database), metadata/build, security headers,
 * no-store caching, CORS for the web origin, rejection of foreign origins and
 * unauthenticated requests, and — with a dedicated smoke account — login,
 * session and one read. Never prints tokens or passwords.
 */
const base = (process.env.API_URL ?? 'http://127.0.0.1:5000').replace(/\/+$/, '');
const results = [];
const check = async (name, fn) => {
  try {
    await fn();
    results.push([name, 'PASS', '']);
  } catch (error) {
    results.push([name, 'FAIL', error instanceof Error ? error.message : String(error)]);
  }
};
const expect = (condition, message) => {
  if (!condition) throw new Error(message);
};
const get = (path, headers = {}) => fetch(`${base}${path}`, { headers });

await check('liveness', async () => {
  const res = await get('/api/v1/health/live');
  expect(res.status === 200, `HTTP ${res.status}`);
});
await check('readiness (database)', async () => {
  const res = await get('/api/v1/health/ready');
  expect(res.status === 200, `HTTP ${res.status}`);
});
await check('metadata and build version', async () => {
  const res = await get('/api/v1');
  expect(res.status === 200, `HTTP ${res.status}`);
  const body = await res.json();
  const version = body.data?.build?.version;
  expect(version, 'no build metadata');
  if (process.env.EXPECT_VERSION) {
    expect(
      version === process.env.EXPECT_VERSION,
      `version ${version} ≠ ${process.env.EXPECT_VERSION}`,
    );
  }
});
await check('security headers and no-store', async () => {
  const res = await get('/api/v1/health/live');
  for (const header of ['content-security-policy', 'x-content-type-options', 'x-frame-options']) {
    expect(res.headers.get(header), `missing ${header}`);
  }
  expect(res.headers.get('cache-control') === 'no-store', 'Cache-Control is not no-store');
  expect(!res.headers.get('x-powered-by'), 'x-powered-by is exposed');
  if (base.startsWith('https://'))
    expect(res.headers.get('strict-transport-security'), 'missing HSTS');
});
await check('unauthenticated requests are rejected', async () => {
  const res = await get('/api/v1/leads');
  expect(res.status === 401, `HTTP ${res.status}`);
});
await check('foreign origins get no CORS access', async () => {
  const res = await get('/api/v1/health/live', { Origin: 'https://smoke-foreign.invalid' });
  expect(!res.headers.get('access-control-allow-origin'), 'foreign origin allowed');
});
if (process.env.WEB_ORIGIN) {
  await check('web origin may send credentials', async () => {
    const res = await get('/api/v1/health/live', { Origin: process.env.WEB_ORIGIN });
    expect(
      res.headers.get('access-control-allow-origin') === process.env.WEB_ORIGIN,
      'origin not allowed',
    );
    expect(
      res.headers.get('access-control-allow-credentials') === 'true',
      'credentials not allowed',
    );
  });
}
await check('metrics are not public', async () => {
  const res = await get('/metrics');
  expect(res.status === 401 || res.status === 404, `HTTP ${res.status}`);
});
if (process.env.SMOKE_EMAIL && process.env.SMOKE_PASSWORD) {
  await check('login, session and a tenant read', async () => {
    const login = await fetch(`${base}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: process.env.SMOKE_EMAIL,
        password: process.env.SMOKE_PASSWORD,
        client: 'mobile',
      }),
    });
    expect(login.status === 200, `login HTTP ${login.status}`);
    const { accessToken, refreshToken } = (await login.json()).data;
    const auth = { authorization: `Bearer ${accessToken}` };
    expect((await get('/api/v1/auth/session', auth)).status === 200, 'session failed');
    expect((await get('/api/v1/leads?limit=1', auth)).status === 200, 'lead read failed');
    await fetch(`${base}/api/v1/auth/logout`, {
      method: 'POST',
      headers: { ...auth, 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
  });
} else {
  results.push(['login, session and a tenant read', 'SKIP', 'SMOKE_EMAIL/SMOKE_PASSWORD not set']);
}

for (const [name, status, detail] of results) {
  console.log(`${status.padEnd(4)}  ${name}${detail ? ` — ${detail}` : ''}`);
}
process.exitCode = results.some(([, status]) => status === 'FAIL') ? 1 : 0;
