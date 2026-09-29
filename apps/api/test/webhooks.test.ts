import { decryptSecret, parseSecretKey } from '@crm/integrations';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createTestSchema, hasTestDatabase, type TestSchema } from './helpers/db.js';
import { seedTenants, type TenantFixture } from './helpers/fixtures.js';
import { call, loginMobile, startApp, type TestServer } from './helpers/http.js';

const PUBLIC = 'hooks.example.com';
const PRIVATE = 'intranet.example.com';

describe.skipIf(!hasTestDatabase)('outbound webhook management', () => {
  let db: TestSchema;
  let server: TestServer;
  let fx: TenantFixture;
  let base: string;
  const tokens: Record<string, string> = {};

  beforeAll(async () => {
    db = await createTestSchema('crm_webhooks');
    fx = await seedTenants(db.pool);
    process.env.DATABASE_URL = db.url;
    server = await startApp();
    base = server.baseUrl;
    const service = await import('../src/modules/webhooks/webhooks.service.js');
    service.useWebhookResolver(async (host) => {
      if (host === PUBLIC) return ['93.184.216.34'];
      if (host === PRIVATE) return ['10.0.0.5'];
      throw new Error(`ENOTFOUND ${host}`);
    });

    // Custom role in A that holds only the integrations permission.
    const role = await db.pool.query(
      `INSERT INTO roles (organization_id, name, key, is_system) VALUES ($1, 'Integrator', 'integrator', false)
       RETURNING id`,
      [fx.orgA.id],
    );
    await db.pool.query(
      `INSERT INTO role_permissions (role_id, permission_key, scope)
       VALUES ($1, 'settings.integrations.manage', 'organization')`,
      [role.rows[0].id],
    );
    await db.pool.query(
      'UPDATE organization_memberships SET role_id = $1 WHERE organization_id = $2 AND user_id = $3',
      [role.rows[0].id, fx.orgA.id, fx.users.aSales2.id],
    );
    for (const key of ['aAdmin', 'aManager', 'aSales', 'aSales2', 'bAdmin'] as const) {
      tokens[key] = (await loginMobile(base, fx.users[key].email)).accessToken;
    }
  });

  afterAll(async () => {
    await server?.close();
    await db?.drop();
  });

  const as = (who: string, method: string, path: string, body?: unknown) =>
    call(base, method, `/api/v1${path}`, { token: tokens[who]!, body });
  const create = (who = 'aAdmin', body: Record<string, unknown> = {}) =>
    as(who, 'POST', '/webhooks', {
      url: `https://${PUBLIC}/crm`,
      events: ['lead.created'],
      ...body,
    });

  it('is restricted to settings.integrations.manage (admin and custom role; not manager or sales)', async () => {
    expect((await as('aManager', 'GET', '/webhooks')).status).toBe(403);
    expect((await as('aSales', 'GET', '/webhooks')).status).toBe(403);
    expect((await create('aManager')).status).toBe(403);
    expect((await as('aAdmin', 'GET', '/webhooks')).status).toBe(200);
    expect((await as('aSales2', 'GET', '/webhooks')).status).toBe(200);
    expect((await call(base, 'GET', '/api/v1/webhooks')).status).toBe(401);
  });

  it('shows the secret once and stores it encrypted', async () => {
    const res = await create('aAdmin', { description: 'Zapier' });
    expect(res.status).toBe(201);
    const { endpoint, secret } = res.body.data;
    expect(secret).toMatch(/^whsec_[A-Za-z0-9_-]{40,}$/);
    expect(endpoint).toMatchObject({
      url: `https://${PUBLIC}/crm`,
      events: ['lead.created'],
      active: true,
      description: 'Zapier',
      lastDelivery: null,
    });

    const stored = (
      await db.pool.query('SELECT secret_ciphertext FROM webhook_endpoints WHERE public_id = $1', [
        endpoint.id,
      ])
    ).rows[0].secret_ciphertext as string;
    expect(stored).not.toContain(secret);
    const key = parseSecretKey(process.env.WEBHOOK_SECRET_KEY!);
    expect(decryptSecret(key, stored)).toBe(secret);

    const listed = await as('aAdmin', 'GET', '/webhooks');
    expect(JSON.stringify(listed.body)).not.toContain(secret);
    expect(JSON.stringify(listed.body)).not.toContain('secret');
    const audit = await db.pool.query(
      `SELECT new_values::text AS v FROM audit_logs WHERE action LIKE 'WEBHOOK_%'`,
    );
    expect(audit.rows.length).toBeGreaterThan(0);
    for (const row of audit.rows) expect(row.v ?? '').not.toContain(secret);
  });

  it('rotates the secret, updates events and toggles the endpoint', async () => {
    const { endpoint, secret } = (await create()).body.data;
    const rotated = await as('aAdmin', 'POST', `/webhooks/${endpoint.id}/rotate-secret`);
    expect(rotated.status).toBe(200);
    expect(rotated.body.data.secret).not.toBe(secret);

    const updated = await as('aAdmin', 'PATCH', `/webhooks/${endpoint.id}`, {
      events: ['task.completed', 'lead.created', 'lead.created'],
      active: false,
    });
    expect(updated.status).toBe(200);
    expect(updated.body.data).toMatchObject({
      events: ['lead.created', 'task.completed'],
      active: false,
    });
    expect((await as('aAdmin', 'PATCH', `/webhooks/${endpoint.id}`, {})).status).toBe(400);
    expect((await as('aAdmin', 'DELETE', `/webhooks/${endpoint.id}`)).status).toBe(200);
    expect((await as('aAdmin', 'DELETE', `/webhooks/${endpoint.id}`)).status).toBe(404);
  });

  it('rejects unsafe targets and unknown events', async () => {
    const bad = [
      { url: `http://${PUBLIC}/crm` },
      { url: `https://user:pw@${PUBLIC}/crm` },
      { url: 'https://127.0.0.1/hook' },
      { url: 'https://10.1.2.3/hook' },
      { url: 'https://[::1]/hook' },
      { url: 'https://localhost/hook' },
      { url: `https://${PRIVATE}/hook` },
      { url: 'https://unresolvable.example.com/hook' },
      { url: 'ftp://files.example.com' },
      { events: ['auth.password_reset_requested'] },
      { events: ['lead.deleted_everything'] },
      { events: [] },
    ];
    for (const body of bad) {
      const res = await create('aAdmin', body);
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(JSON.stringify(res.body)).not.toMatch(/ENOTFOUND|10\.0\.0\.5/);
    }
    const allowed = await as('aAdmin', 'GET', '/webhooks/event-types');
    expect(allowed.body.data).toContain('lead.created');
    expect(allowed.body.data).not.toContain('auth.password_reset_requested');
  });

  it('isolates tenants', async () => {
    const { endpoint } = (await create()).body.data;
    expect((await as('bAdmin', 'GET', '/webhooks')).body.data).toEqual([]);
    expect(
      (await as('bAdmin', 'PATCH', `/webhooks/${endpoint.id}`, { active: false })).status,
    ).toBe(404);
    expect((await as('bAdmin', 'POST', `/webhooks/${endpoint.id}/rotate-secret`)).status).toBe(404);
    expect((await as('bAdmin', 'DELETE', `/webhooks/${endpoint.id}`)).status).toBe(404);
    const still = await db.pool.query('SELECT active FROM webhook_endpoints WHERE public_id = $1', [
      endpoint.id,
    ]);
    expect(still.rows[0].active).toBe(true);
  });

  it('caps endpoints per organization', async () => {
    await db.pool.query('DELETE FROM webhook_endpoints');
    for (let i = 0; i < 10; i++) expect((await create()).status).toBe(201);
    expect((await create()).status).toBe(409);
  });

  it('never logs the secret', async () => {
    const writes: string[] = [];
    const capture = (chunk: unknown) => {
      writes.push(String(chunk));
      return true;
    };
    const out = vi.spyOn(process.stdout, 'write').mockImplementation(capture);
    const err = vi.spyOn(process.stderr, 'write').mockImplementation(capture);
    let secret = '';
    try {
      await db.pool.query('DELETE FROM webhook_endpoints');
      secret = (await create()).body.data.secret;
    } finally {
      out.mockRestore();
      err.mockRestore();
    }
    expect(secret).not.toBe('');
    expect(writes.join('')).not.toContain(secret);
  });
});
