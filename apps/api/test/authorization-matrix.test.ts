import { BUILT_IN_ROLES, type Permission, type PermissionGrants } from '@crm/permissions';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { RouteDefinition } from '../src/platform/http/route.js';
import { createTestSchema, hasTestDatabase, type TestSchema } from './helpers/db.js';
import { seedTenants, type TenantFixture } from './helpers/fixtures.js';
import { call, loginMobile, startApp, type TestServer } from './helpers/http.js';

/**
 * Authorization matrix derived from the route registry and the role grants
 * (@crm/permissions): for every permission-guarded route and every role —
 * Admin, Manager, Sales and an organization custom role —
 *   - no grant (or insufficient scope) → 403 FORBIDDEN, before validation or
 *     any side effect;
 *   - granted GET routes never answer 403.
 */

const CUSTOM_GRANTS: PermissionGrants = {
  'crm.leads.read': 'own',
  'crm.tasks.read': 'organization',
  'crm.reports.read': 'own',
  'settings.integrations.manage': 'organization',
};

const ROLE_GRANTS: Record<string, PermissionGrants> = {
  aAdmin: BUILT_IN_ROLES.admin.grants,
  aManager: BUILT_IN_ROLES.manager.grants,
  aSales: BUILT_IN_ROLES.sales.grants,
  aSales2: CUSTOM_GRANTS,
};

let routes: RouteDefinition[] = [];

/** Any id works: authorization is decided before parameters are validated or loaded. */
const concrete = (path: string) => path.replace(/:\w+/g, '999999');

const allowed = (grants: PermissionGrants, permission: Permission, scope?: string) => {
  const granted = grants[permission];
  if (!granted) return false;
  return scope !== 'organization' || granted === 'organization';
};

describe.skipIf(!hasTestDatabase)('authorization matrix (route registry × roles)', () => {
  let db: TestSchema;
  let server: TestServer;
  let fx: TenantFixture;
  const token: Record<string, string> = {};

  beforeAll(async () => {
    db = await createTestSchema('crm_authz_matrix');
    fx = await seedTenants(db.pool);
    process.env.DATABASE_URL = db.url;
    server = await startApp();
    // Imported after startApp: route modules share the app's database pool.
    const { apiModules } = await import('../src/modules/index.js');
    routes = apiModules
      .flatMap((m) => m.routes)
      .filter((r) => r.permission && (r.auth ?? 'session') === 'session');
    const role = await db.pool.query(
      `INSERT INTO roles (organization_id, name, key, is_system) VALUES ($1, 'Auditor', 'auditor', false)
       RETURNING id`,
      [fx.orgA.id],
    );
    for (const [permission, scope] of Object.entries(CUSTOM_GRANTS)) {
      await db.pool.query(
        'INSERT INTO role_permissions (role_id, permission_key, scope) VALUES ($1, $2, $3)',
        [role.rows[0].id, permission, scope],
      );
    }
    await db.pool.query(
      'UPDATE organization_memberships SET role_id = $1 WHERE organization_id = $2 AND user_id = $3',
      [role.rows[0].id, fx.orgA.id, fx.users.aSales2.id],
    );
    for (const who of Object.keys(ROLE_GRANTS)) {
      token[who] = (await loginMobile(server.baseUrl, fx.users[who as 'aAdmin'].email)).accessToken;
    }
  });

  afterAll(async () => {
    await server?.close();
    await db?.drop();
  });

  it('covers every guarded route', () => {
    expect(routes.length).toBeGreaterThan(60);
  });

  for (const who of Object.keys(ROLE_GRANTS)) {
    it(`${who}: denied routes answer 403 and granted reads never do`, async () => {
      const failures: string[] = [];
      for (const route of routes) {
        const path = `/api/v1${concrete(route.path)}`;
        const ok = allowed(ROLE_GRANTS[who]!, route.permission!, route.scope);
        if (!ok) {
          const res = await call(server.baseUrl, route.method.toUpperCase(), path, {
            token: token[who]!,
            body: route.method === 'get' ? undefined : {},
          });
          if (res.status !== 403 || res.body?.error?.code !== 'FORBIDDEN') {
            failures.push(
              `${route.method.toUpperCase()} ${route.path} → ${res.status} (expected 403)`,
            );
          }
        } else if (route.method === 'get' && !route.produces) {
          const res = await call(server.baseUrl, 'GET', path, { token: token[who]! });
          if (res.status === 403 && res.body?.error?.code === 'FORBIDDEN') {
            failures.push(`GET ${route.path} → 403 (granted ${route.permission})`);
          }
        }
      }
      expect(failures).toEqual([]);
    });
  }

  it('every paginated list rejects unbounded or invalid page sizes', async () => {
    const paginated = routes.filter((r) => r.paginated && r.method === 'get');
    expect(paginated.length).toBeGreaterThan(5);
    const failures: string[] = [];
    for (const route of paginated) {
      const path = `/api/v1${concrete(route.path)}`;
      for (const query of ['limit=1000', 'limit=0', 'limit=-1', 'page=0', 'limit=abc']) {
        const res = await call(server.baseUrl, 'GET', `${path}?${query}`, { token: token.aAdmin! });
        if (res.status !== 400) failures.push(`${route.path}?${query} → ${res.status}`);
      }
      const ok = await call(server.baseUrl, 'GET', `${path}?limit=100`, { token: token.aAdmin! });
      if (ok.status === 200 && ok.body.meta.pagination.limit > 100) {
        failures.push(`${route.path} returned limit ${ok.body.meta.pagination.limit}`);
      }
    }
    expect(failures).toEqual([]);
  });

  it('a custom role gets exactly its grants in the session', async () => {
    const session = await call(server.baseUrl, 'GET', '/api/v1/auth/session', {
      token: token.aSales2!,
    });
    expect(session.body.data.membership.role.key).toBe('auditor');
    expect(session.body.data.permissions).toEqual(CUSTOM_GRANTS);
  });

  it('manager and sales cannot manage integrations, members or settings', async () => {
    for (const who of ['aManager', 'aSales']) {
      for (const [method, path] of [
        ['GET', '/api/v1/webhooks'],
        ['POST', '/api/v1/organization/members'],
        ['PATCH', '/api/v1/settings'],
      ] as const) {
        const res = await call(server.baseUrl, method, path, {
          token: token[who]!,
          body: method === 'GET' ? undefined : {},
        });
        expect(res.status, `${who} ${method} ${path}`).toBe(403);
      }
    }
  });
});
