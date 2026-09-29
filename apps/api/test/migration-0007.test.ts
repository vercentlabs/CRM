import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestSchema, hasTestDatabase, type TestSchema } from './helpers/db.js';
import { PASSWORD, seedTenants, type TenantFixture } from './helpers/fixtures.js';
import {
  call,
  loginMobile,
  startApp,
  type MobileSession,
  type TestServer,
} from './helpers/http.js';

/**
 * Upgrade 0004 → 0007 (Phase 6 runtime platform) on a live multi-tenant
 * database: existing data, sessions and message history survive; every
 * organization lands on the default plan (nobody is locked out); new writes
 * emit outbox events.
 */
const COUNTED = [
  'users',
  'organizations',
  'organization_memberships',
  'role_permissions',
  'auth_sessions',
  'auth_refresh_tokens',
  'password_resets',
  'leads',
  'customers',
  'opportunities',
  'tasks',
  'followups',
  'notes',
  'calls',
  'messages',
  'chat_messages',
  'settings',
  'audit_logs',
] as const;

/** Rows that later additive migrations introduce by design (0008: one admin grant). */
const ADDED_LATER: Partial<Record<string, string>> = {
  role_permissions: " WHERE permission_key <> 'settings.integrations.manage'",
};

describe.skipIf(!hasTestDatabase)('migrations 0005–0007 upgrade (0004 → latest)', () => {
  let db: TestSchema;
  let server: TestServer;
  let fx: TenantFixture;
  let session: MobileSession;
  const before: Record<string, number> = {};
  let messageStatuses: unknown[];

  beforeAll(async () => {
    db = await createTestSchema('crm_mig_0007', { upTo: '0004' });
    fx = await seedTenants(db.pool);
    await db.pool.query(
      `INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES ($1, 'legacyhash', now() + interval '1 hour')`,
      [fx.users.aSales.id],
    );
    process.env.DATABASE_URL = db.url;
    server = await startApp();
    // Sign in before the upgrade (the 0004-era session must survive it).
    session = await loginMobile(server.baseUrl, fx.users.aAdmin.email);
    for (const table of COUNTED) {
      before[table] = Number((await db.pool.query(`SELECT count(*) FROM ${table}`)).rows[0].count);
    }
    messageStatuses = (await db.pool.query('SELECT id, status, sent_at FROM messages ORDER BY id'))
      .rows;
    await db.migrateAll();
  });

  afterAll(async () => {
    await server?.close();
    await db?.drop();
  });

  it('preserves every record, including historical sent messages and pending resets', async () => {
    for (const table of COUNTED) {
      expect(
        Number(
          (await db.pool.query(`SELECT count(*) FROM ${table}${ADDED_LATER[table] ?? ''}`)).rows[0]
            .count,
        ),
        table,
      ).toBe(before[table]);
    }
    expect(
      (await db.pool.query('SELECT id, status, sent_at FROM messages ORDER BY id')).rows,
    ).toEqual(messageStatuses);
    const reset = await db.pool.query(
      `SELECT count(*) FROM password_resets WHERE token_hash = 'legacyhash'`,
    );
    expect(Number(reset.rows[0].count)).toBe(1);
  });

  it('puts every existing organization on an active default plan with nothing gated', async () => {
    const subscriptions = await db.pool.query(
      `SELECT o.slug, p.key, s.status FROM organizations o
       JOIN subscriptions s ON s.organization_id = o.id JOIN plans p ON p.id = s.plan_id ORDER BY o.slug`,
    );
    expect(subscriptions.rows).toEqual([
      { slug: 'alpha', key: 'base', status: 'active' },
      { slug: 'beta', key: 'base', status: 'active' },
    ]);
    const res = await call(server.baseUrl, 'GET', '/api/v1/organization/entitlements', {
      token: session.accessToken,
    });
    expect(res.status).toBe(200);
    expect(res.body.data.features).toEqual({
      'reports.export': true,
      'messages.bulk': true,
      'files.upload': true,
    });
    expect(res.body.data.limits).toEqual({ seats: null, 'storage.bytes': null });
  });

  it('keeps existing sessions and logins working, and new writes emit outbox events', async () => {
    const refreshed = await call(server.baseUrl, 'POST', '/api/v1/auth/refresh', {
      body: { refreshToken: session.refreshToken },
    });
    expect(refreshed.status).toBe(200);
    const login = await call(server.baseUrl, 'POST', '/api/v1/auth/login', {
      body: { email: fx.users.bSales.email, password: PASSWORD, client: 'mobile' },
    });
    expect(login.status).toBe(200);
    const created = await call(server.baseUrl, 'POST', '/api/v1/leads', {
      token: refreshed.body.data.accessToken,
      body: { full_name: 'After Upgrade', mobile_number: '9000000009' },
    });
    expect(created.status).toBe(201);
    const events = await db.pool.query(
      `SELECT event_type, organization_id FROM outbox_events WHERE aggregate_id = $1`,
      [String(created.body.data.id)],
    );
    expect(events.rows).toEqual([{ event_type: 'lead.created', organization_id: fx.orgA.id }]);
  });

  it('is repeat-safe', async () => {
    await db.migrateAll();
    const applied = await db.pool.query(
      `SELECT version FROM schema_migrations WHERE version IN ('0005', '0006', '0007') ORDER BY version`,
    );
    expect(applied.rows.map((r) => r.version)).toEqual(['0005', '0006', '0007']);
  });
});
