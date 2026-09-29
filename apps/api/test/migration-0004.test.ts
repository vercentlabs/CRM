import { createHash } from 'node:crypto';
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
 * Upgrade 0003 → 0004 on a live multi-tenant database: users that still carry
 * legacy `users.role_id` values, two organizations, memberships with built-in
 * roles, grants, active sessions and CRM records. Dropping the legacy role
 * columns must not change any of it, and signed-in users stay signed in.
 */
const COUNTED = [
  'users',
  'organizations',
  'organization_memberships',
  'roles',
  'role_permissions',
  'auth_sessions',
  'auth_refresh_tokens',
  'leads',
  'customers',
  'opportunities',
  'tasks',
  'followups',
  'notes',
  'calls',
  'messages',
  'chat_conversations',
  'chat_messages',
  'sales_locations',
  'settings',
  'audit_logs',
] as const;

/** Rows that later additive migrations introduce by design (0008: one admin grant). */
const ADDED_LATER: Partial<Record<string, string>> = {
  role_permissions: " WHERE permission_key <> 'settings.integrations.manage'",
};

describe.skipIf(!hasTestDatabase)('migration 0004 upgrade (0003 → 0004)', () => {
  let db: TestSchema;
  let server: TestServer;
  let fx: TenantFixture;
  let adminSession: MobileSession;
  const before: Record<string, number> = {};
  let memberships: unknown[];

  const snapshotMemberships = async () =>
    (
      await db.pool.query(
        'SELECT organization_id, user_id, role_id, status FROM organization_memberships ORDER BY organization_id, user_id',
      )
    ).rows;

  beforeAll(async () => {
    db = await createTestSchema('crm_mig_0004', { upTo: '0003' });
    fx = await seedTenants(db.pool);
    // Representative legacy state: every user still has the deprecated global role id.
    await db.pool.query(
      `UPDATE users u SET role_id = m.role_id
       FROM organization_memberships m
       WHERE m.user_id = u.id AND m.role_id IN (1, 2, 3)`,
    );
    expect(
      Number(
        (await db.pool.query('SELECT count(*) FROM users WHERE role_id IS NOT NULL')).rows[0].count,
      ),
    ).toBeGreaterThan(0);

    // The current API runs against the 0003 schema too (it no longer reads the legacy columns).
    process.env.DATABASE_URL = db.url;
    server = await startApp();
    adminSession = await loginMobile(server.baseUrl, fx.users.aAdmin.email);

    for (const table of COUNTED) {
      before[table] = Number((await db.pool.query(`SELECT count(*) FROM ${table}`)).rows[0].count);
    }
    memberships = await snapshotMemberships();

    await db.migrateAll();
  });

  afterAll(async () => {
    await server?.close();
    await db?.drop();
  });

  it('drops users.role_id and roles.legacy_role_id and keeps built-in role ids 1/2/3', async () => {
    const columns = await db.pool.query(
      `SELECT table_name, column_name FROM information_schema.columns
       WHERE table_schema = $1 AND ((table_name = 'users' AND column_name = 'role_id')
          OR (table_name = 'roles' AND column_name = 'legacy_role_id'))`,
      [db.schema],
    );
    expect(columns.rows).toEqual([]);
    const roles = await db.pool.query(
      'SELECT id, key, is_system FROM roles WHERE organization_id IS NULL ORDER BY id',
    );
    expect(roles.rows).toEqual([
      { id: 1, key: 'admin', is_system: true },
      { id: 2, key: 'manager', is_system: true },
      { id: 3, key: 'sales', is_system: true },
    ]);
  });

  it('preserves users, organizations, memberships, grants, sessions and CRM records', async () => {
    for (const table of COUNTED) {
      expect(
        Number(
          (await db.pool.query(`SELECT count(*) FROM ${table}${ADDED_LATER[table] ?? ''}`)).rows[0]
            .count,
        ),
        table,
      ).toBe(before[table]);
    }
    expect(await snapshotMemberships()).toEqual(memberships);
  });

  it('keeps existing sessions valid and lets members sign in with their membership role', async () => {
    const leads = await call(server.baseUrl, 'GET', '/api/v1/leads', {
      token: adminSession.accessToken,
    });
    expect(leads.status).toBe(200);

    const refreshed = await call(server.baseUrl, 'POST', '/api/v1/auth/refresh', {
      body: { refreshToken: adminSession.refreshToken },
    });
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.data.membership.role.key).toBe('admin');

    for (const [who, role] of [
      ['aManager', 'manager'],
      ['aSales', 'sales'],
      ['bSales', 'sales'],
    ] as const) {
      const login = await call(server.baseUrl, 'POST', '/api/v1/auth/login', {
        body: { email: fx.users[who].email, password: PASSWORD, client: 'mobile' },
      });
      expect(login.status, who).toBe(200);
      expect(login.body.data.membership.role.key).toBe(role);
      expect(login.body.data.user).not.toHaveProperty('roleId');
    }
    // Refresh tokens are still stored hashed only.
    const hash = createHash('sha256').update(adminSession.refreshToken).digest('hex');
    const stored = await db.pool.query(
      'SELECT count(*) FROM auth_refresh_tokens WHERE token_hash = $1',
      [hash],
    );
    expect(Number(stored.rows[0].count)).toBe(1);
  });

  it('is repeat-safe', async () => {
    await db.migrateAll();
    const applied = await db.pool.query(
      `SELECT count(*) FROM schema_migrations WHERE version = '0004'`,
    );
    expect(Number(applied.rows[0].count)).toBe(1);
  });
});
