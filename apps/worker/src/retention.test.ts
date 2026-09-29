import { createTestSchema, hasTestDatabase, type TestSchema } from '@crm/database';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { seed, testDeps, type Seed } from './__tests__/fixtures.js';
import * as maintenance from './processors/maintenance.js';

const windows = {
  sessionDays: 30,
  passwordResetDays: 7,
  notificationDays: 90,
  deliveryDays: 30,
  deletedFileDays: 30,
};

describe.skipIf(!hasTestDatabase)('maintenance retention (PostgreSQL)', () => {
  let db: TestSchema;
  let fx: Seed;

  beforeAll(async () => {
    db = await createTestSchema('wk_retention');
    fx = await seed(db.pool);
  });
  afterAll(async () => db?.drop());

  const count = async (sql: string, params: unknown[] = []) =>
    Number((await db.pool.query(`SELECT count(*)::int AS n FROM ${sql}`, params)).rows[0].n);

  const session = async (expires: string, revoked: string | null) =>
    (
      await db.pool.query(
        `INSERT INTO auth_sessions (user_id, organization_id, client, expires_at, revoked_at)
         VALUES ($1, $2, 'web', now() + $3::interval, now() + $4::interval) RETURNING id`,
        [fx.users.aAdmin, fx.orgA, expires, revoked],
      )
    ).rows[0].id as string;
  const refresh = (sessionId: string, expires: string, hash: string) =>
    db.pool.query(
      `INSERT INTO auth_refresh_tokens (session_id, token_hash, expires_at)
       VALUES ($1, $2, now() + $3::interval)`,
      [sessionId, hash.padEnd(64, '0'), expires],
    );

  it('purges only stale security and transport records, never business data', async () => {
    const live = await session('10 days', null);
    const oldExpired = await session('-40 days', null);
    const oldRevoked = await session('10 days', '-40 days');
    const recentRevoked = await session('10 days', '-1 day');
    await refresh(live, '10 days', 'a');
    await refresh(live, '-40 days', 'b'); // expired token of a live session
    await refresh(oldExpired, '-40 days', 'c'); // cascades with its session

    await db.pool.query(
      `INSERT INTO password_resets (user_id, token_hash, expires_at, used, created_at) VALUES
         ($1, 'h1', now() - interval '9 days', true,  now() - interval '9 days'),
         ($1, 'h2', now() - interval '9 days', false, now() - interval '9 days'),
         ($1, 'h3', now() + interval '1 hour', false, now()),
         ($1, 'h4', now() - interval '1 day',  true,  now() - interval '1 day')`,
      [fx.users.aAdmin],
    );
    await db.pool.query(
      `INSERT INTO notifications (organization_id, user_id, type, title, dedupe_key, read_at, created_at) VALUES
         ($1, $2, 't', 'old read',   'n1', now() - interval '100 days', now() - interval '120 days'),
         ($1, $2, 't', 'old unread', 'n2', NULL,                         now() - interval '120 days'),
         ($1, $2, 't', 'recent',     'n3', now() - interval '1 day',     now() - interval '2 days')`,
      [fx.orgA, fx.users.aSales],
    );
    await db.pool.query(
      `INSERT INTO email_deliveries (organization_id, kind, dedupe_key, recipient_user_id, status, updated_at) VALUES
         ($1, 'member_invitation', 'e1', $2, 'sent',    now() - interval '40 days'),
         ($1, 'member_invitation', 'e2', $2, 'pending', now() - interval '40 days'),
         ($1, 'member_invitation', 'e3', $2, 'failed',  now() - interval '1 day')`,
      [fx.orgA, fx.users.aSales],
    );
    await db.pool.query(
      `INSERT INTO files (organization_id, provider, provider_file_id, storage_key, url, filename, mime_type,
                          size_bytes, purpose, status, deleted_at, provider_deleted_at) VALUES
         ($1, 'memory', 'p1', 'k1', 'memory://k1', 'a.txt', 'text/plain', 1, 'chat_attachment', 'deleted',
          now() - interval '50 days', now() - interval '40 days'),
         ($1, 'memory', 'p2', 'k2', 'memory://k2', 'b.txt', 'text/plain', 1, 'chat_attachment', 'deleted',
          now() - interval '50 days', NULL),
         ($1, 'memory', 'p3', 'k3', 'memory://k3', 'c.txt', 'text/plain', 1, 'chat_attachment', 'uploaded',
          NULL, NULL)`,
      [fx.orgA],
    );
    const businessBefore = await count('leads');

    const { deps } = testDeps(db.pool);
    deps.config = { ...deps.config, retention: windows };
    const result = await maintenance.sweep(deps);

    expect(result.retention).toMatchObject({
      sessions: 2,
      refreshTokens: 1,
      passwordResets: 2,
      notifications: 1,
      emailDeliveries: 1,
      deletedFiles: 1,
    });
    const sessions = (await db.pool.query('SELECT id FROM auth_sessions')).rows.map((r) => r.id);
    expect(sessions.sort()).toEqual([live, recentRevoked].sort());
    expect(sessions).not.toContain(oldRevoked);
    expect(await count('auth_refresh_tokens')).toBe(1);
    expect(await count(`password_resets WHERE token_hash IN ('h3', 'h4')`)).toBe(2);
    expect(await count('notifications WHERE read_at IS NULL')).toBe(1);
    expect(await count('notifications')).toBe(2);
    expect(await count(`email_deliveries WHERE status = 'pending'`)).toBe(1);
    expect(await count(`files WHERE provider_file_id IN ('p2', 'p3')`)).toBe(2);
    expect(await count('leads')).toBe(businessBefore);

    // Idempotent: a second sweep has nothing left to remove.
    const again = await maintenance.sweep(deps);
    expect(Object.values(again.retention!).every((n) => n === 0)).toBe(true);
  });

  it('skips retention when no windows are configured', async () => {
    const { deps } = testDeps(db.pool);
    const result = await maintenance.sweep(deps);
    expect(result.retention).toBeUndefined();
  });
});
