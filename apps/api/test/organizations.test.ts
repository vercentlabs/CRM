import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestSchema, hasTestDatabase, type TestSchema } from './helpers/db.js';
import { PASSWORD, seedTenants, type TenantFixture } from './helpers/fixtures.js';
import { call, loginMobile, startApp, type TestServer } from './helpers/http.js';

describe.skipIf(!hasTestDatabase)('organizations and memberships', () => {
  let db: TestSchema;
  let server: TestServer;
  let fx: TenantFixture;
  let base: string;
  const token: Record<string, string> = {};

  const as = (who: string, method: string, path: string, body?: unknown) =>
    call(base, method, path, { token: token[who]!, ...(body === undefined ? {} : { body }) });

  beforeAll(async () => {
    db = await createTestSchema('crm_orgs');
    fx = await seedTenants(db.pool);

    // A custom organization role that may manage members but holds nothing else.
    const role = await db.pool.query(
      `INSERT INTO roles (name, key, organization_id, is_system) VALUES ('User Manager', 'user_manager', $1, false) RETURNING id`,
      [fx.orgA.id],
    );
    await db.pool.query(
      `INSERT INTO role_permissions (role_id, permission_key) VALUES ($1, 'settings.users.read'), ($1, 'settings.users.manage')`,
      [role.rows[0].id],
    );
    await db.pool.query(
      `INSERT INTO roles (name, key, organization_id) VALUES ('Beta Only', 'beta_only', $1)`,
      [fx.orgB.id],
    );
    await db.pool.query(
      `INSERT INTO users (username, email, password_hash, full_name)
       SELECT 'um', 'um@example.test', password_hash, 'User Manager' FROM users WHERE id = $1`,
      [fx.users.aAdmin.id],
    );
    await db.pool.query(
      `INSERT INTO organization_memberships (organization_id, user_id, role_id, status)
       SELECT $1, u.id, $2, 'active' FROM users u WHERE u.email = 'um@example.test'`,
      [fx.orgA.id, role.rows[0].id],
    );

    process.env.DATABASE_URL = db.url;
    server = await startApp();
    base = server.baseUrl;
    for (const who of ['aAdmin', 'aManager', 'aSales', 'bAdmin'] as const) {
      token[who] = (await loginMobile(base, fx.users[who].email)).accessToken;
    }
    token.um = (await loginMobile(base, 'um@example.test')).accessToken;
    token.multi = (await loginMobile(base, fx.users.multi.email)).accessToken;
  });

  afterAll(async () => {
    await server?.close();
    await db?.drop();
  });

  it('lists the caller’s organizations and the current one', async () => {
    const orgs = await as('multi', 'GET', '/api/v1/organizations');
    expect(orgs.status).toBe(200);
    expect(
      orgs.body.data.map((o: { organization: { id: string } }) => o.organization.id).sort(),
    ).toEqual([fx.orgA.publicId, fx.orgB.publicId].sort());
    expect(orgs.body.data.filter((o: { current: boolean }) => o.current)).toHaveLength(1);

    const current = await as('aSales', 'GET', '/api/v1/organization');
    expect(current.body.data).toMatchObject({
      id: fx.orgA.publicId,
      name: 'Alpha Corp',
      membership: { role: { key: 'sales' } },
    });
    expect(JSON.stringify(current.body)).not.toContain(`"id":${fx.orgA.id},`);
  });

  it('lists members of the active organization only, with permission', async () => {
    const members = await as('aAdmin', 'GET', '/api/v1/organization/members');
    const emails = members.body.data.map((m: { email: string }) => m.email);
    expect(emails).toContain(fx.users.aSales.email);
    expect(emails).not.toContain(fx.users.bAdmin.email);
    expect((await as('aSales', 'GET', '/api/v1/organization/members')).status).toBe(403);

    const roles = await as('aAdmin', 'GET', '/api/v1/organization/roles');
    const keys = roles.body.data.map((r: { key: string }) => r.key);
    expect(keys).toEqual(expect.arrayContaining(['admin', 'manager', 'sales', 'user_manager']));
    expect(keys).not.toContain('beta_only');
  });

  it('changes roles within the organization and blocks self-changes', async () => {
    const promote = await as(
      'aAdmin',
      'PATCH',
      `/api/v1/organization/members/${fx.users.aSales2.id}`,
      { roleKey: 'manager' },
    );
    expect(promote.status).toBe(200);
    expect(promote.body.data.role_key).toBe('manager');
    await as('aAdmin', 'PATCH', `/api/v1/organization/members/${fx.users.aSales2.id}`, {
      roleKey: 'sales',
    });

    expect(
      (
        await as('aAdmin', 'PATCH', `/api/v1/organization/members/${fx.users.aAdmin.id}`, {
          status: 'suspended',
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await as('aAdmin', 'PATCH', `/api/v1/organization/members/${fx.users.bAdmin.id}`, {
          roleKey: 'sales',
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await as('aAdmin', 'PATCH', `/api/v1/organization/members/${fx.users.aSales.id}`, {
          roleKey: 'beta_only',
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await as('aManager', 'PATCH', `/api/v1/organization/members/${fx.users.aSales.id}`, {
          roleKey: 'manager',
        })
      ).status,
    ).toBe(403);
  });

  it('prevents privilege escalation by members who can manage users', async () => {
    // user_manager holds settings.users.* only: cannot grant admin/manager, cannot touch an admin.
    const grant = await as('um', 'PATCH', `/api/v1/organization/members/${fx.users.aSales.id}`, {
      roleKey: 'admin',
    });
    expect(grant.status).toBe(403);
    const legacyGrant = await as('um', 'PUT', `/users/${fx.users.aSales.id}`, {
      full_name: 'User a_sales',
      email: fx.users.aSales.email,
      username: 'a_sales',
      role_id: 1,
    });
    expect(legacyGrant.status).toBe(403);
    const suspendAdmin = await as('um', 'PATCH', `/users/${fx.users.aAdmin.id}/status`);
    expect(suspendAdmin.status).toBe(403);
    const createAdmin = await as('um', 'POST', '/users', {
      full_name: 'Sneaky',
      email: 'sneaky@example.test',
      password: 'Passw0rd123',
      roleId: 1,
    });
    expect(createAdmin.status).toBe(403);
  });

  it('creates new members with a validated password', async () => {
    const weak = await as('aAdmin', 'POST', '/users', {
      full_name: 'Weak',
      email: 'weak@example.test',
      password: 'short',
      roleId: 3,
    });
    expect(weak.status).toBe(400);
    const created = await as('aAdmin', 'POST', '/users', {
      full_name: 'New Rep',
      email: 'newrep@example.test',
      password: 'Passw0rd123',
      roleId: 3,
    });
    expect(created.status).toBe(201);
    expect(created.body.user).toMatchObject({
      email: 'newrep@example.test',
      role_key: 'sales',
      membership_status: 'active',
    });
    const login = await call(base, 'POST', '/api/v1/auth/login', {
      body: { email: 'newrep@example.test', password: 'Passw0rd123', client: 'mobile' },
    });
    expect(login.body.data.organization.id).toBe(fx.orgA.publicId);
  });

  it('invites existing identities without modifying them', async () => {
    const invite = await as('aAdmin', 'POST', '/users', {
      full_name: 'Hijacked Name',
      email: fx.users.bAdmin.email,
      password: 'Attack3rPass',
      roleId: 3,
    });
    expect(invite.status).toBe(201);
    expect(invite.body.user.membership_status).toBe('invited');

    // Identity untouched: old password still works, name unchanged, and org B is still the default.
    const user = (
      await db.pool.query('SELECT full_name FROM users WHERE id = $1', [fx.users.bAdmin.id])
    ).rows[0];
    expect(user.full_name).toBe('User b_admin');
    const bLogin = await call(base, 'POST', '/api/v1/auth/login', {
      body: {
        email: fx.users.bAdmin.email,
        password: PASSWORD,
        client: 'mobile',
        organizationId: fx.orgA.publicId,
      },
    });
    expect(bLogin.status).toBe(403);

    const orgs = await as('bAdmin', 'GET', '/api/v1/organizations');
    expect(
      orgs.body.data.find(
        (o: { organization: { id: string } }) => o.organization.id === fx.orgA.publicId,
      ).status,
    ).toBe('invited');
    const accept = await as(
      'bAdmin',
      'POST',
      `/api/v1/organizations/${fx.orgA.publicId}/accept-invitation`,
    );
    expect(accept.status).toBe(200);
    const aLogin = await call(base, 'POST', '/api/v1/auth/login', {
      body: {
        email: fx.users.bAdmin.email,
        password: PASSWORD,
        client: 'mobile',
        organizationId: fx.orgA.publicId,
      },
    });
    expect(aLogin.status).toBe(200);
    expect(aLogin.body.data.membership.role.key).toBe('sales');

    expect(
      (await as('aSales', 'POST', `/api/v1/organizations/${fx.orgB.publicId}/accept-invitation`))
        .status,
    ).toBe(404);
  });

  it('does not let one tenant edit the identity of a user shared with another tenant', async () => {
    const res = await as('aAdmin', 'PUT', `/users/${fx.users.multi.id}`, {
      full_name: 'Renamed',
      email: fx.users.multi.email,
      username: 'multi',
      role_id: 3,
    });
    expect(res.status).toBe(403);
    const exclusive = await as('aAdmin', 'PUT', `/users/${fx.users.aSales.id}`, {
      full_name: 'Renamed Sales',
      email: fx.users.aSales.email,
      username: 'a_sales',
      role_id: 3,
    });
    expect(exclusive.status).toBe(200);
    expect(exclusive.body.user.full_name).toBe('Renamed Sales');
  });

  it('keeps /users/me tenant-aware', async () => {
    const me = await as('multi', 'GET', '/users/me');
    expect(me.body.user.organization.id).toBe(fx.orgA.publicId);
    expect(me.body.user.permissions['crm.leads.read']).toBe('own');
  });
});
