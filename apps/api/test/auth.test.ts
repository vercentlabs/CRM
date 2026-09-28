import { createHash } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createTestSchema, hasTestDatabase, type TestSchema } from './helpers/db.js';
import { PASSWORD, seedTenants, type TenantFixture } from './helpers/fixtures.js';
import { call, cookiesFrom, loginMobile, startApp, type TestServer } from './helpers/http.js';

describe.skipIf(!hasTestDatabase)('authentication and sessions', () => {
  let db: TestSchema;
  let server: TestServer;
  let fx: TenantFixture;
  let base: string;

  beforeAll(async () => {
    db = await createTestSchema('crm_auth');
    fx = await seedTenants(db.pool);
    process.env.DATABASE_URL = db.url;
    // Reuse detection is exercised without the concurrent-tab grace window here.
    process.env.REFRESH_REUSE_GRACE_SECONDS = '0';
    server = await startApp();
    base = server.baseUrl;
  });

  afterAll(async () => {
    await server?.close();
    await db?.drop();
  });

  const login = (body: Record<string, unknown>) =>
    call(base, 'POST', '/api/v1/auth/login', { body });

  describe('login', () => {
    it('issues a short-lived access token, a refresh token and the tenant context', async () => {
      const res = await login({
        email: fx.users.aManager.email,
        password: PASSWORD,
        client: 'mobile',
      });
      expect(res.status).toBe(200);
      const data = res.body.data;
      expect(data.organization).toEqual({
        id: fx.orgA.publicId,
        name: 'Alpha Corp',
        slug: 'alpha',
      });
      expect(data.membership.role.key).toBe('manager');
      expect(data.permissions['crm.leads.read']).toBe('organization');
      expect(data.user).toEqual({
        id: fx.users.aManager.id,
        email: fx.users.aManager.email,
        name: expect.any(String),
      });
      expect(data.user).not.toHaveProperty('roleId');
      const claims = jwt.decode(data.accessToken) as jwt.JwtPayload;
      expect(claims.exp! - claims.iat!).toBe(900);
      expect(claims).not.toHaveProperty('roleId');
      expect(typeof data.refreshToken).toBe('string');
      expect(data.csrfToken).toBeUndefined();
    });

    it('stores only a SHA-256 hash of the refresh token', async () => {
      const session = await loginMobile(base, fx.users.aAdmin.email);
      const hash = createHash('sha256').update(session.refreshToken).digest('hex');
      const rows = (await db.pool.query('SELECT token_hash FROM auth_refresh_tokens')).rows.map(
        (r) => r.token_hash,
      );
      expect(rows).toContain(hash);
      expect(rows).not.toContain(session.refreshToken);
    });

    it('returns the same generic 401 for wrong password, unknown email, disabled user and suspended membership', async () => {
      const attempts = [
        { email: fx.users.aSales.email, password: 'Wrongpass123' },
        { email: 'nobody@example.test', password: PASSWORD },
        { email: fx.users.disabled.email, password: PASSWORD },
        { email: fx.users.suspended.email, password: PASSWORD },
      ];
      for (const attempt of attempts) {
        const res = await login(attempt);
        expect(res.status).toBe(401);
        expect(res.body.error.message).toBe('Invalid email or password');
        expect(res.body.error.code).toBe('UNAUTHENTICATED');
      }
    });

    it('validates input with a safe envelope', async () => {
      const res = await login({ email: 'not-an-email', password: 'x' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
      expect(JSON.stringify(res.body)).not.toMatch(/stack|at .*\.js/);
    });

    it('signs in to a requested organization only with an active membership there', async () => {
      const b = await login({
        email: fx.users.multi.email,
        password: PASSWORD,
        client: 'mobile',
        organizationId: fx.orgB.publicId,
      });
      expect(b.status).toBe(200);
      expect(b.body.data.organization.id).toBe(fx.orgB.publicId);
      expect(b.body.data.membership.role.key).toBe('manager');
      expect(b.body.data.organizations).toHaveLength(2);

      const denied = await login({
        email: fx.users.aSales.email,
        password: PASSWORD,
        client: 'mobile',
        organizationId: fx.orgB.publicId,
      });
      expect(denied.status).toBe(403);
    });

    it('never logs passwords or tokens', async () => {
      const spies = [
        vi.spyOn(console, 'log'),
        vi.spyOn(console, 'error'),
        vi.spyOn(console, 'warn'),
      ];
      const session = await loginMobile(base, fx.users.aSales.email);
      await call(base, 'POST', '/api/v1/auth/refresh', {
        body: { refreshToken: session.refreshToken },
      });
      await login({ email: fx.users.aSales.email, password: 'Wrongpass123' });
      const output = spies
        .flatMap((spy) => spy.mock.calls.flat())
        .map(String)
        .join('\n');
      expect(output).not.toContain(session.accessToken);
      expect(output).not.toContain(session.refreshToken);
      expect(output).not.toContain(PASSWORD);
      spies.forEach((spy) => spy.mockRestore());
    });
  });

  describe('access tokens', () => {
    it('rejects expired, tampered and session-less tokens', async () => {
      const session = await loginMobile(base, fx.users.aSales.email);
      const claims = jwt.decode(session.accessToken) as jwt.JwtPayload;
      const expired = jwt.sign(
        {
          sid: claims.sid,
          org: claims.org,
          typ: 'access',
          exp: Math.floor(Date.now() / 1000) - 10,
        },
        process.env.JWT_SECRET!,
        { subject: claims.sub!, issuer: 'crm-api', audience: 'crm' },
      );
      const forged = jwt.sign({ sid: claims.sid, org: fx.orgB.id, typ: 'access' }, 'wrong-secret', {
        subject: claims.sub!,
        issuer: 'crm-api',
        audience: 'crm',
      });
      const orgSwap = jwt.sign(
        { sid: claims.sid, org: fx.orgB.id, typ: 'access' },
        process.env.JWT_SECRET!,
        {
          subject: claims.sub!,
          issuer: 'crm-api',
          audience: 'crm',
          expiresIn: 60,
        },
      );
      for (const token of [expired, forged, orgSwap]) {
        expect((await call(base, 'GET', '/api/v1/leads', { token })).status).toBe(401);
      }
      expect(
        (await call(base, 'GET', '/api/v1/leads', { token: session.accessToken })).status,
      ).toBe(200);
    });

    it('stops working immediately when the membership is suspended', async () => {
      const victim = await loginMobile(base, fx.users.aSales2.email);
      expect((await call(base, 'GET', '/api/v1/leads', { token: victim.accessToken })).status).toBe(
        200,
      );
      const admin = await loginMobile(base, fx.users.aAdmin.email);
      const suspend = await call(
        base,
        'PATCH',
        `/api/v1/organization/members/${fx.users.aSales2.id}`,
        {
          token: admin.accessToken,
          body: { status: 'suspended' },
        },
      );
      expect(suspend.status).toBe(200);
      expect(suspend.body.data.membership_status).toBe('suspended');
      expect((await call(base, 'GET', '/api/v1/leads', { token: victim.accessToken })).status).toBe(
        401,
      );
      expect(
        (
          await call(base, 'POST', '/api/v1/auth/refresh', {
            body: { refreshToken: victim.refreshToken },
          })
        ).status,
      ).toBe(401);
      await call(base, 'PATCH', `/api/v1/organization/members/${fx.users.aSales2.id}`, {
        token: admin.accessToken,
        body: { status: 'active' },
      });
    });
  });

  describe('refresh rotation', () => {
    it('rotates refresh tokens and invalidates the old one', async () => {
      const session = await loginMobile(base, fx.users.aSales.email);
      const first = await call(base, 'POST', '/api/v1/auth/refresh', {
        body: { refreshToken: session.refreshToken },
      });
      expect(first.status).toBe(200);
      expect(first.body.data.refreshToken).not.toBe(session.refreshToken);
      expect(
        (await call(base, 'GET', '/api/v1/leads', { token: first.body.data.accessToken })).status,
      ).toBe(200);

      // Replaying the rotated token is treated as theft: rejected and the whole session is revoked.
      const replay = await call(base, 'POST', '/api/v1/auth/refresh', {
        body: { refreshToken: session.refreshToken },
      });
      expect(replay.status).toBe(401);
      expect(
        (await call(base, 'GET', '/api/v1/leads', { token: first.body.data.accessToken })).status,
      ).toBe(401);
      const second = await call(base, 'POST', '/api/v1/auth/refresh', {
        body: { refreshToken: first.body.data.refreshToken },
      });
      expect(second.status).toBe(401);
    });

    it('tolerates concurrent refreshes inside the grace window without revoking', async () => {
      const { rotateRefreshToken } = await import('../src/platform/auth/repository.js');
      const session = await loginMobile(base, fx.users.aManager.email);
      const hash = (value: string) => createHash('sha256').update(value).digest('hex');
      const first = await rotateRefreshToken({
        presentedHash: hash(session.refreshToken),
        newHash: hash('next-1'),
        graceSeconds: 60,
      });
      expect(first.status).toBe('rotated');
      const concurrent = await rotateRefreshToken({
        presentedHash: hash(session.refreshToken),
        newHash: hash('next-2'),
        graceSeconds: 60,
      });
      expect(concurrent).toEqual({ status: 'reused', revoked: false });
      expect(
        (await call(base, 'GET', '/api/v1/leads', { token: session.accessToken })).status,
      ).toBe(200);
    });

    it('rejects unknown refresh tokens', async () => {
      const res = await call(base, 'POST', '/api/v1/auth/refresh', {
        body: { refreshToken: 'not-a-real-token' },
      });
      expect(res.status).toBe(401);
    });
  });

  describe('logout', () => {
    it('revokes the session server-side', async () => {
      const session = await loginMobile(base, fx.users.aSales.email);
      const out = await call(base, 'POST', '/api/v1/auth/logout', { token: session.accessToken });
      expect(out.status).toBe(200);
      expect(
        (await call(base, 'GET', '/api/v1/leads', { token: session.accessToken })).status,
      ).toBe(401);
      expect(
        (
          await call(base, 'POST', '/api/v1/auth/refresh', {
            body: { refreshToken: session.refreshToken },
          })
        ).status,
      ).toBe(401);
    });

    it('can revoke with only the refresh token (expired access token)', async () => {
      const session = await loginMobile(base, fx.users.aSales.email);
      const out = await call(base, 'POST', '/api/v1/auth/logout', {
        body: { refreshToken: session.refreshToken },
      });
      expect(out.status).toBe(200);
      expect(
        (await call(base, 'GET', '/api/v1/leads', { token: session.accessToken })).status,
      ).toBe(401);
    });
  });

  describe('organization switching', () => {
    it('switches only to organizations with an active membership', async () => {
      const session = await loginMobile(base, fx.users.multi.email, {
        organizationId: fx.orgA.publicId,
      });
      const switched = await call(base, 'POST', '/api/v1/auth/switch-organization', {
        token: session.accessToken,
        body: { organizationId: fx.orgB.publicId },
      });
      expect(switched.status).toBe(200);
      expect(switched.body.data.organization.id).toBe(fx.orgB.publicId);
      const leads = await call(base, 'GET', '/api/v1/leads', {
        token: switched.body.data.accessToken,
      });
      expect(leads.body.data.length).toBeGreaterThan(0);
      expect(
        leads.body.data.every((l: { full_name: string }) => l.full_name.startsWith('Beta')),
      ).toBe(true);
      // The previous access token was bound to organization A and is no longer valid.
      expect(
        (await call(base, 'GET', '/api/v1/leads', { token: session.accessToken })).status,
      ).toBe(401);

      const outsider = await loginMobile(base, fx.users.aSales.email);
      for (const organizationId of [fx.orgB.publicId, '00000000-0000-4000-8000-00000000abcd']) {
        const denied = await call(base, 'POST', '/api/v1/auth/switch-organization', {
          token: outsider.accessToken,
          body: { organizationId },
        });
        expect(denied.status).toBe(403);
        expect(denied.body.error.message).toBe('You do not have access to this organization');
      }
    });
  });

  describe('browser cookie flow', () => {
    it('sets HttpOnly cookies, keeps tokens out of the body and enforces CSRF', async () => {
      const res = await login({ email: fx.users.aManager.email, password: PASSWORD });
      expect(res.status).toBe(200);
      expect(res.body.data.accessToken).toBeUndefined();
      expect(res.body.data.refreshToken).toBeUndefined();
      const csrf = res.body.data.csrfToken as string;
      expect(csrf).toBeTruthy();

      const jar = cookiesFrom(res.headers);
      expect(jar.crm_at!.attributes).toMatch(/HttpOnly/i);
      expect(jar.crm_at!.attributes).toMatch(/SameSite=Lax/i);
      expect(jar.crm_at!.attributes).toMatch(/Path=\//i);
      expect(jar.crm_rt!.attributes).toMatch(/HttpOnly/i);
      expect(jar.crm_rt!.attributes).toMatch(/Path=\/api\/v1\/auth/i);
      expect(res.headers.get('cache-control')).toBe('no-store');

      const cookie = `crm_at=${jar.crm_at!.value}`;
      expect((await call(base, 'GET', '/api/v1/leads', { headers: { cookie } })).status).toBe(200);

      const lead = { full_name: 'Cookie Lead', mobile_number: '9000000001' };
      expect(
        (await call(base, 'POST', '/api/v1/leads', { headers: { cookie }, body: lead })).status,
      ).toBe(403);
      expect(
        (
          await call(base, 'POST', '/api/v1/leads', {
            headers: { cookie, 'x-csrf-token': 'forged' },
            body: lead,
          })
        ).status,
      ).toBe(403);
      expect(
        (
          await call(base, 'POST', '/api/v1/leads', {
            headers: { cookie, 'x-csrf-token': csrf },
            body: lead,
          })
        ).status,
      ).toBe(201);

      const session = await call(base, 'GET', '/api/v1/auth/session', { headers: { cookie } });
      expect(session.body.data.csrfToken).toBe(csrf);

      const refreshed = await call(base, 'POST', '/api/v1/auth/refresh', {
        headers: { cookie: `crm_rt=${jar.crm_rt!.value}` },
      });
      expect(refreshed.status).toBe(200);
      const next = cookiesFrom(refreshed.headers);
      expect(next.crm_rt!.value).not.toBe(jar.crm_rt!.value);

      const nextCookie = `crm_at=${next.crm_at!.value}`;
      expect(
        (await call(base, 'POST', '/api/v1/auth/logout', { headers: { cookie: nextCookie } }))
          .status,
      ).toBe(403);
      const out = await call(base, 'POST', '/api/v1/auth/logout', {
        headers: { cookie: nextCookie, 'x-csrf-token': csrf },
      });
      expect(out.status).toBe(200);
      expect(cookiesFrom(out.headers).crm_at!.attributes).toMatch(/Expires=Thu, 01 Jan 1970/);
      expect(
        (await call(base, 'GET', '/api/v1/leads', { headers: { cookie: nextCookie } })).status,
      ).toBe(401);
    });

    it('allows credentialed CORS only for allow-listed origins', async () => {
      const allowed = await fetch(`${base}/api/v1/auth/session`, {
        method: 'OPTIONS',
        headers: { Origin: 'http://web.example.test', 'Access-Control-Request-Method': 'GET' },
      });
      expect(allowed.headers.get('access-control-allow-origin')).toBe('http://web.example.test');
      expect(allowed.headers.get('access-control-allow-credentials')).toBe('true');

      const other = await fetch(`${base}/api/v1/auth/session`, {
        method: 'OPTIONS',
        headers: { Origin: 'https://evil.example', 'Access-Control-Request-Method': 'GET' },
      });
      expect(other.headers.get('access-control-allow-origin')).toBe('*');
      expect(other.headers.get('access-control-allow-credentials')).toBeNull();
    });
  });

  describe('removed pre-v1 auth endpoints', () => {
    it('answers the old body-token routes with a JSON 404 (no auth adapters remain)', async () => {
      for (const [method, path] of [
        ['POST', '/auth/login'],
        ['POST', '/auth/refresh'],
        ['POST', '/auth/logout'],
        ['GET', '/users/me'],
        ['POST', '/users/forgot-password'],
      ] as const) {
        const res = await call(
          base,
          method,
          path,
          method === 'GET' ? {} : { body: { email: fx.users.aSales.email, password: PASSWORD } },
        );
        expect(`${method} ${path} ${res.status}`).toBe(`${method} ${path} 404`);
        expect(res.body.success).toBe(false);
        expect(res.body.error.code).toBe('NOT_FOUND');
        expect(JSON.stringify(res.body)).not.toMatch(/token/i);
      }
    });
  });

  describe('password reset', () => {
    it('resets the password and revokes existing sessions', async () => {
      const session = await loginMobile(base, fx.users.bSales.email);
      const token = 'reset-token-for-tests';
      await db.pool.query(
        `INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES ($1, $2, now() + interval '1 hour')`,
        [fx.users.bSales.id, createHash('sha256').update(token).digest('hex')],
      );
      const res = await call(base, 'POST', '/api/v1/auth/password/reset', {
        body: { token, newPassword: 'Newpassw0rd' },
      });
      expect(res.status).toBe(200);
      expect(
        (await call(base, 'GET', '/api/v1/leads', { token: session.accessToken })).status,
      ).toBe(401);
      expect(
        (
          await call(base, 'POST', '/api/v1/auth/password/reset', {
            body: { token, newPassword: 'Newpassw0rd2' },
          })
        ).status,
      ).toBe(400);
      const relogin = await login({
        email: fx.users.bSales.email,
        password: 'Newpassw0rd',
        client: 'mobile',
      });
      expect(relogin.status).toBe(200);
      await db.pool.query(
        'UPDATE users SET password_hash = (SELECT password_hash FROM users WHERE id = $1) WHERE id = $2',
        [fx.users.bAdmin.id, fx.users.bSales.id],
      );
    });

    it('does not reveal whether an email exists', async () => {
      const known = await call(base, 'POST', '/api/v1/auth/password/forgot', {
        body: { email: fx.users.aSales.email },
      });
      const unknown = await call(base, 'POST', '/api/v1/auth/password/forgot', {
        body: { email: 'ghost@example.test' },
      });
      expect(known.status).toBe(200);
      expect(unknown.body).toEqual(known.body);
    });
  });

  describe('SMTP diagnostics', () => {
    it('is no longer public and never returns error details', async () => {
      expect((await call(base, 'POST', '/api/v1/settings/email/verify')).status).toBe(401);
      const sales = await loginMobile(base, fx.users.aSales.email);
      expect(
        (await call(base, 'POST', '/api/v1/settings/email/verify', { token: sales.accessToken }))
          .status,
      ).toBe(403);
    });
  });
});
