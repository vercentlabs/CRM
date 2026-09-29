import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestSchema, hasTestDatabase, type TestSchema } from './helpers/db.js';
import { seedTenants, type TenantFixture } from './helpers/fixtures.js';
import { call, loginMobile, startApp, type Json, type TestServer } from './helpers/http.js';

const PNG = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082',
  'hex',
);

/** Races that clients and retries produce in practice: the outcome must stay exactly-once. */
describe.skipIf(!hasTestDatabase)('API concurrency (real HTTP + PostgreSQL)', () => {
  let db: TestSchema;
  let server: TestServer;
  let fx: TenantFixture;
  let base: string;

  beforeAll(async () => {
    db = await createTestSchema('crm_concurrency');
    fx = await seedTenants(db.pool);
    process.env.DATABASE_URL = db.url;
    process.env.REFRESH_REUSE_GRACE_SECONDS = '0';
    server = await startApp();
    base = server.baseUrl;
  });

  afterAll(async () => {
    await server?.close();
    await db?.drop();
    delete process.env.REFRESH_REUSE_GRACE_SECONDS;
  });

  it('rotates a refresh token at most once under parallel refreshes', async () => {
    const session = await loginMobile(base, fx.users.aManager.email);
    const results = await Promise.all(
      Array.from({ length: 6 }, () =>
        call(base, 'POST', '/api/v1/auth/refresh', {
          body: { refreshToken: session.refreshToken },
        }),
      ),
    );
    const succeeded = results.filter((r) => r.status === 200);
    expect(succeeded.length).toBeLessThanOrEqual(1);
    expect(results.every((r) => r.status === 200 || r.status === 401)).toBe(true);
    const issued = new Set(succeeded.map((r) => r.body.data.refreshToken));
    expect(issued.size).toBe(succeeded.length);
    // The old token can never be used again.
    expect(
      (
        await call(base, 'POST', '/api/v1/auth/refresh', {
          body: { refreshToken: session.refreshToken },
        })
      ).status,
    ).toBe(401);
  });

  it('deletes a file once and releases its storage once under parallel deletes', async () => {
    const { accessToken } = await loginMobile(base, fx.users.aSales.email);
    const form = new FormData();
    form.append('file', new Blob([PNG], { type: 'image/png' }), 'p.png');
    const uploaded = (await (
      await fetch(`${base}/api/v1/files/chat-attachments`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
        body: form,
      })
    ).json()) as Json;
    const usage = async () =>
      Number(
        (
          await db.pool.query(
            `SELECT value FROM usage_counters WHERE organization_id = $1 AND metric = 'storage.bytes'
               AND period = 'lifetime'`,
            [fx.orgA.id],
          )
        ).rows[0]?.value ?? 0,
      );
    const before = await usage();
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        call(base, 'DELETE', `/api/v1/files/${uploaded.data.id}`, { token: accessToken }),
      ),
    );
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(results.filter((r) => r.status === 404)).toHaveLength(4);
    expect(await usage()).toBe(before - PNG.length);
    const events = await db.pool.query(
      `SELECT count(*)::int AS n FROM outbox_events WHERE event_type = 'file.deleted' AND organization_id = $1`,
      [fx.orgA.id],
    );
    expect(events.rows[0].n).toBe(1);
  });

  it('accepts an invitation once under parallel acceptance', async () => {
    await db.pool.query(
      `INSERT INTO organization_memberships (organization_id, user_id, role_id, status)
       VALUES ($1, $2, 3, 'invited')`,
      [fx.orgA.id, fx.users.bSales.id],
    );
    const { accessToken } = await loginMobile(base, fx.users.bSales.email);
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        call(base, 'POST', `/api/v1/organizations/${fx.orgA.publicId}/accept-invitation`, {
          token: accessToken,
        }),
      ),
    );
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(results.every((r) => r.status < 500)).toBe(true);
    const memberships = await db.pool.query(
      `SELECT status FROM organization_memberships WHERE organization_id = $1 AND user_id = $2`,
      [fx.orgA.id, fx.users.bSales.id],
    );
    expect(memberships.rows).toEqual([{ status: 'active' }]);
  });
});
