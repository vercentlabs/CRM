import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestSchema, hasTestDatabase, type TestSchema } from './helpers/db.js';
import { seedTenants, type TenantFixture } from './helpers/fixtures.js';
import {
  call,
  loginMobile,
  startApp,
  type MobileSession,
  type TestServer,
} from './helpers/http.js';

/**
 * Upgrade from the Phase 6 schema (0007) to the latest migration on a live
 * multi-tenant database: every record survives, sessions issued before the
 * upgrade keep working, and only the built-in Admin role gains the new
 * integrations permission (Manager, Sales and custom roles are untouched).
 */
const COUNTED = [
  'users',
  'organizations',
  'organization_memberships',
  'roles',
  'auth_sessions',
  'leads',
  'customers',
  'tasks',
  'messages',
  'settings',
  'subscriptions',
  'plans',
  'outbox_events',
  'webhook_endpoints',
] as const;

describe.skipIf(!hasTestDatabase)('migration upgrade 0007 → latest', () => {
  let db: TestSchema;
  let server: TestServer;
  let fx: TenantFixture;
  let session: MobileSession;
  const before: Record<string, number> = {};
  let grantsBefore: unknown[];

  beforeAll(async () => {
    db = await createTestSchema('crm_mig_0008', { upTo: '0007' });
    fx = await seedTenants(db.pool);
    const custom = await db.pool.query(
      `INSERT INTO roles (organization_id, name, key, is_system) VALUES ($1, 'Ops', 'ops', false) RETURNING id`,
      [fx.orgA.id],
    );
    await db.pool.query(
      `INSERT INTO role_permissions (role_id, permission_key, scope) VALUES ($1, 'settings.users.read', 'organization')`,
      [custom.rows[0].id],
    );
    process.env.DATABASE_URL = db.url;
    server = await startApp();
    session = await loginMobile(server.baseUrl, fx.users.aAdmin.email);
    for (const table of COUNTED) {
      before[table] = Number((await db.pool.query(`SELECT count(*) FROM ${table}`)).rows[0].count);
    }
    grantsBefore = (
      await db.pool.query(
        'SELECT role_id, permission_key, scope FROM role_permissions ORDER BY role_id, permission_key',
      )
    ).rows;
    await db.migrateAll();
  });

  afterAll(async () => {
    await server?.close();
    await db?.drop();
  });

  it('preserves every record', async () => {
    for (const table of COUNTED) {
      expect(
        Number((await db.pool.query(`SELECT count(*) FROM ${table}`)).rows[0].count),
        table,
      ).toBe(before[table]);
    }
  });

  it('adds only the Admin grant for settings.integrations.manage', async () => {
    const grants = (
      await db.pool.query(
        'SELECT role_id, permission_key, scope FROM role_permissions ORDER BY role_id, permission_key',
      )
    ).rows;
    const added = grants.filter(
      (g) => !grantsBefore.some((b) => JSON.stringify(b) === JSON.stringify(g)),
    );
    expect(added).toEqual([
      { role_id: 1, permission_key: 'settings.integrations.manage', scope: 'organization' },
    ]);
    expect(grants).toHaveLength(grantsBefore.length + 1);
  });

  it('keeps pre-upgrade sessions valid and exposes the new capability to admins', async () => {
    expect(
      (await call(server.baseUrl, 'GET', '/api/v1/leads', { token: session.accessToken })).status,
    ).toBe(200);
    // Grants are read per request: the existing admin session gains the permission.
    expect(
      (await call(server.baseUrl, 'GET', '/api/v1/webhooks', { token: session.accessToken }))
        .status,
    ).toBe(200);
    const manager = await loginMobile(server.baseUrl, fx.users.aManager.email);
    expect(
      (await call(server.baseUrl, 'GET', '/api/v1/webhooks', { token: manager.accessToken }))
        .status,
    ).toBe(403);
  });
});
