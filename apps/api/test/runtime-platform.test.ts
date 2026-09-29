import { createHmac } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestSchema, hasTestDatabase, type TestSchema } from './helpers/db.js';
import { PASSWORD, seedTenants, type TenantFixture } from './helpers/fixtures.js';
import { call, loginMobile, startApp, type Json, type TestServer } from './helpers/http.js';

const PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52,
]);

/**
 * Phase 6 API surface: transactional outbox emission from CRM services,
 * personal notifications, entitlements and seat limits, file metadata and
 * lifecycle, and the signed SMS delivery-report webhook.
 */
describe.skipIf(!hasTestDatabase)('runtime platform (real HTTP + PostgreSQL)', () => {
  let db: TestSchema;
  let server: TestServer;
  let fx: TenantFixture;
  let base: string;
  const token: Record<string, string> = {};

  const as = (who: string, method: string, path: string, body?: unknown) =>
    call(base, method, `/api/v1${path}`, {
      token: token[who]!,
      ...(body === undefined ? {} : { body }),
    });
  const events = async (type: string) =>
    (
      await db.pool.query(
        `SELECT organization_id, actor_user_id, aggregate_id, payload FROM outbox_events WHERE event_type = $1 ORDER BY occurred_at`,
        [type],
      )
    ).rows;
  const eventCount = async () =>
    Number((await db.pool.query('SELECT count(*) FROM outbox_events')).rows[0].count);

  beforeAll(async () => {
    db = await createTestSchema('crm_runtime');
    fx = await seedTenants(db.pool);
    process.env.DATABASE_URL = db.url;
    server = await startApp();
    base = server.baseUrl;
    for (const who of [
      'aAdmin',
      'aManager',
      'aSales',
      'aSales2',
      'bAdmin',
      'bSales',
      'multi',
    ] as const) {
      token[who] = (await loginMobile(base, fx.users[who].email)).accessToken;
    }
  });

  afterAll(async () => {
    await server?.close();
    await db?.drop();
  });

  describe('domain events (transactional outbox)', () => {
    it('emits lead.created and lead.assigned with the session organization and actor', async () => {
      const res = await as('aManager', 'POST', '/leads', {
        full_name: 'Outbox Lead',
        mobile_number: '9111111111',
        assigned_to: fx.users.aSales.id,
      });
      expect(res.status).toBe(201);
      const id = String(res.body.data.id);
      expect((await events('lead.created')).find((e) => e.aggregate_id === id)).toMatchObject({
        organization_id: fx.orgA.id,
        actor_user_id: fx.users.aManager.id,
        payload: { leadId: res.body.data.id, assignedTo: fx.users.aSales.id },
      });
      expect((await events('lead.assigned')).find((e) => e.aggregate_id === id)).toMatchObject({
        payload: { assignedTo: fx.users.aSales.id, previousAssignedTo: null },
      });
    });

    it('writes nothing when the business operation fails', async () => {
      const before = await eventCount();
      const res = await as('aManager', 'POST', '/leads', {
        full_name: 'Cross Tenant',
        mobile_number: '9111111112',
        assigned_to: fx.users.bSales.id,
      });
      expect(res.status).toBe(400);
      expect(await eventCount()).toBe(before);
    });

    it('emits status, stage, task, follow-up and invitation events', async () => {
      await as('aSales', 'PATCH', `/leads/${fx.records.leadA1}`, { status: 'Contacted' });
      expect((await events('lead.status_changed')).at(-1)!.payload).toMatchObject({
        to: 'Contacted',
      });

      await as('aAdmin', 'PATCH', `/opportunities/${fx.records.oppA}`, { stage: 'Negotiation' });
      expect((await events('opportunity.stage_changed')).at(-1)!.payload).toMatchObject({
        to: 'Negotiation',
      });

      await as('aManager', 'PATCH', `/tasks/${fx.records.taskA}`, {
        assigned_to: fx.users.aSales2.id,
      });
      expect((await events('task.assigned')).at(-1)!.payload).toMatchObject({
        assignedTo: fx.users.aSales2.id,
      });
      await as('aManager', 'PATCH', `/tasks/${fx.records.taskA}`, { status: 'completed' });
      await as('aManager', 'PATCH', `/tasks/${fx.records.taskA}`, { title: 'still completed' });
      expect(await events('task.completed')).toHaveLength(1);

      const followup = await as('aSales', 'POST', `/leads/${fx.records.leadA1}/followups`, {
        scheduled_at: new Date(Date.now() + 86_400_000).toISOString(),
      });
      expect(followup.status).toBe(201);
      expect((await events('followup.scheduled')).at(-1)!.payload).toMatchObject({
        leadId: fx.records.leadA1,
      });

      const invite = await as('aAdmin', 'POST', '/organization/members', {
        full_name: 'Beta Admin',
        email: fx.users.bAdmin.email,
        password: 'Passw0rd123',
        roleKey: 'sales',
      });
      expect(invite.status).toBe(201);
      expect((await events('member.invited')).at(-1)).toMatchObject({
        organization_id: fx.orgA.id,
        payload: { userId: fx.users.bAdmin.id, roleKey: 'sales' },
      });
    });

    it('queues password-reset delivery without creating or storing a token in the API', async () => {
      const res = await call(base, 'POST', '/api/v1/auth/password/forgot', {
        body: { email: fx.users.bSales.email },
      });
      expect(res.status).toBe(200);
      const reset = (
        await db.pool.query(
          'SELECT id, token_hash FROM password_resets WHERE user_id = $1 ORDER BY id DESC LIMIT 1',
          [fx.users.bSales.id],
        )
      ).rows[0];
      expect(reset.token_hash).toBeNull();
      expect((await events('auth.password_reset_requested')).at(-1)).toMatchObject({
        organization_id: null,
        payload: { passwordResetId: reset.id },
      });
    });
  });

  describe('notifications API', () => {
    const insert = (orgId: number, userId: number, title: string, read = false) =>
      db.pool.query(
        `INSERT INTO notifications (organization_id, user_id, type, title, dedupe_key, read_at, entity_type, entity_id)
         VALUES ($1, $2, 'lead.assigned', $3, $3, $4, 'lead', 1) RETURNING public_id`,
        [orgId, userId, title, read ? new Date() : null],
      );

    beforeAll(async () => {
      await insert(fx.orgA.id, fx.users.aSales.id, 'mine-1');
      await insert(fx.orgA.id, fx.users.aSales.id, 'mine-2');
      await insert(fx.orgA.id, fx.users.aSales.id, 'mine-read', true);
      await insert(fx.orgA.id, fx.users.aSales2.id, 'colleague');
      await insert(fx.orgA.id, fx.users.multi.id, 'multi-in-A');
      await insert(fx.orgB.id, fx.users.multi.id, 'multi-in-B');
    });

    it('lists only my notifications in the active organization, with unread count', async () => {
      const list = await as('aSales', 'GET', '/notifications');
      expect(list.status).toBe(200);
      expect(list.body.data.map((n: { title: string }) => n.title).sort()).toEqual([
        'mine-1',
        'mine-2',
        'mine-read',
      ]);
      expect(list.body.data[0]).not.toHaveProperty('user_id');
      expect((await as('aSales', 'GET', '/notifications?unread=true')).body.data).toHaveLength(2);
      expect((await as('aSales', 'GET', '/notifications/unread-count')).body.data).toEqual({
        count: 2,
      });
      const multi = await as('multi', 'GET', '/notifications');
      expect(multi.body.data.map((n: { title: string }) => n.title)).toEqual(['multi-in-A']);
    });

    it('marks my notifications read and cannot touch anyone else’s', async () => {
      const colleague = (
        await db.pool.query(`SELECT public_id FROM notifications WHERE title = 'colleague'`)
      ).rows[0].public_id;
      expect((await as('aSales', 'POST', `/notifications/${colleague}/read`)).status).toBe(404);
      const other = (
        await db.pool.query(`SELECT public_id FROM notifications WHERE title = 'multi-in-B'`)
      ).rows[0].public_id;
      expect((await as('multi', 'POST', `/notifications/${other}/read`)).status).toBe(404);

      const mine = (
        await db.pool.query(`SELECT public_id FROM notifications WHERE title = 'mine-1'`)
      ).rows[0].public_id;
      expect((await as('aSales', 'POST', `/notifications/${mine}/read`)).status).toBe(200);
      expect((await as('aSales', 'GET', '/notifications/unread-count')).body.data.count).toBe(1);
      expect((await as('aSales', 'POST', '/notifications/read-all')).body.data).toEqual({
        updated: 1,
      });
      expect((await as('aSales', 'GET', '/notifications/unread-count')).body.data.count).toBe(0);
      const colleagueRow = (
        await db.pool.query(`SELECT read_at FROM notifications WHERE title = 'colleague'`)
      ).rows[0];
      expect(colleagueRow.read_at).toBeNull();
    });

    it('requires authentication', async () => {
      expect((await call(base, 'GET', '/api/v1/notifications')).status).toBe(401);
    });
  });

  describe('entitlements and seats', () => {
    // Imported after startApp so the module shares the app's database pool.
    let invalidateEntitlements: () => void = () => undefined;
    beforeAll(async () => {
      ({ invalidateEntitlements } = await import('../src/platform/entitlements.js'));
    });
    const usePlan = async (
      orgId: number,
      key: string,
      entitlements: Array<[string, boolean, number | null]>,
    ) => {
      const plan = (
        await db.pool.query(
          `INSERT INTO plans (key, name) VALUES ($1, $1) ON CONFLICT (key) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
          [key],
        )
      ).rows[0].id;
      await db.pool.query('DELETE FROM plan_entitlements WHERE plan_id = $1', [plan]);
      for (const [k, enabled, limit] of entitlements) {
        await db.pool.query(
          'INSERT INTO plan_entitlements (plan_id, key, enabled, limit_value) VALUES ($1, $2, $3, $4)',
          [plan, k, enabled, limit],
        );
      }
      await db.pool.query(
        'UPDATE subscriptions SET plan_id = $2, status = $3 WHERE organization_id = $1',
        [orgId, plan, 'active'],
      );
      invalidateEntitlements();
    };
    const activeSeats = async (orgId: number) =>
      Number(
        (
          await db.pool.query(
            `SELECT count(*) FROM organization_memberships m JOIN users u ON u.id = m.user_id
             WHERE m.organization_id = $1 AND m.status = 'active' AND COALESCE(u.is_active, true)`,
            [orgId],
          )
        ).rows[0].count,
      );
    const newMember = (who: string, email: string, extra: Record<string, unknown> = {}) =>
      as(who, 'POST', '/organization/members', {
        full_name: 'Seat Test',
        email,
        password: 'Passw0rd123',
        roleKey: 'sales',
        ...extra,
      });

    it('keeps migrated organizations on the default plan with everything enabled', async () => {
      const res = await as('aSales', 'GET', '/organization/entitlements');
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({
        plan: { key: 'base' },
        subscriptionStatus: 'active',
        features: { 'reports.export': true, 'messages.bulk': true, 'files.upload': true },
        limits: { seats: null, 'storage.bytes': null },
        usage: { seats: await activeSeats(fx.orgA.id) },
      });
      expect(JSON.stringify(res.body)).not.toMatch(/external_|price|currency/);
    });

    it('enforces a seat limit on one organization only, ignoring body tricks', async () => {
      const seatsB = await activeSeats(fx.orgB.id);
      await usePlan(fx.orgB.id, 'seats-at-limit', [['seats', true, seatsB]]);
      const blocked = await newMember('bAdmin', 'seat1@example.test', {
        seats: 999,
        plan: 'base',
        status: 'active',
      });
      expect(blocked.status).toBe(409);
      expect(blocked.body.error.code).toBe('PLAN_LIMIT_REACHED');
      expect(await activeSeats(fx.orgB.id)).toBe(seatsB);
      // Organization A's plan is untouched.
      expect((await newMember('aAdmin', 'seat-a@example.test')).status).toBe(201);
      // Invitations do not take a seat until accepted — and acceptance is checked.
      const invite = await newMember('bAdmin', fx.users.aSales2.email);
      expect(invite.status).toBe(201);
      const aSales2 = await loginMobile(base, fx.users.aSales2.email);
      const accept = await call(
        base,
        'POST',
        `/api/v1/organizations/${fx.orgB.publicId}/accept-invitation`,
        {
          token: aSales2.accessToken,
        },
      );
      expect(accept.status).toBe(409);
    });

    it('does not count suspended members, and blocks reactivation at the limit', async () => {
      const suspend = await as('bAdmin', 'PATCH', `/organization/members/${fx.users.bSales.id}`, {
        status: 'suspended',
      });
      expect(suspend.status).toBe(200);
      expect((await newMember('bAdmin', 'seat2@example.test')).status).toBe(201); // freed seat reused
      const reactivate = await as(
        'bAdmin',
        'PATCH',
        `/organization/members/${fx.users.bSales.id}`,
        { status: 'active' },
      );
      expect(reactivate.status).toBe(409);
      expect(reactivate.body.error.code).toBe('PLAN_LIMIT_REACHED');
    });

    it('never exceeds the limit under concurrent member creation', async () => {
      const seats = await activeSeats(fx.orgA.id);
      await usePlan(fx.orgA.id, 'one-more-seat', [
        ['seats', true, seats + 1],
        ['reports.export', true, null],
        ['files.upload', true, null],
        ['messages.bulk', false, null],
      ]);
      const results = await Promise.all(
        Array.from({ length: 6 }, (_, i) => newMember('aAdmin', `race${i}@example.test`)),
      );
      expect(results.filter((r) => r.status === 201)).toHaveLength(1);
      expect(results.filter((r) => r.status === 409)).toHaveLength(5);
      expect(await activeSeats(fx.orgA.id)).toBe(seats + 1);
    });

    it('answers FEATURE_NOT_ENABLED for a disabled capability (permission alone is not enough)', async () => {
      const res = await as('aAdmin', 'POST', '/messages/bulk', {
        lead_ids: [fx.records.leadA1],
        channel: 'sms',
        content: 'hi',
      });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FEATURE_NOT_ENABLED');
      expect(
        (await as('aAdmin', 'GET', '/organization/entitlements')).body.data.features[
          'messages.bulk'
        ],
      ).toBe(false);
      await usePlan(fx.orgA.id, 'base-again', [
        ['seats', true, null],
        ['reports.export', true, null],
        ['files.upload', true, null],
        ['messages.bulk', true, null],
        ['storage.bytes', true, null],
      ]);
    });
  });

  describe('entitlement matrix', () => {
    let invalidate: () => void = () => undefined;
    beforeAll(async () => {
      ({ invalidateEntitlements: invalidate } = await import('../src/platform/entitlements.js'));
      // Known starting point for both organizations (earlier suites change plans).
      await setPlan(fx.orgA.id, 'matrix-full', FULL);
      await setPlan(fx.orgB.id, 'matrix-full-b', FULL);
    });
    const FULL: Array<[string, boolean, number | null]> = [
      ['seats', true, null],
      ['reports.export', true, null],
      ['files.upload', true, null],
      ['messages.bulk', true, null],
      ['storage.bytes', true, null],
    ];
    const setPlan = async (
      orgId: number,
      key: string,
      rows: Array<[string, boolean, number | null]>,
    ) => {
      const plan = (
        await db.pool.query(
          `INSERT INTO plans (key, name) VALUES ($1, $1) ON CONFLICT (key) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
          [key],
        )
      ).rows[0].id;
      await db.pool.query('DELETE FROM plan_entitlements WHERE plan_id = $1', [plan]);
      for (const [k, enabled, limit] of rows) {
        await db.pool.query(
          'INSERT INTO plan_entitlements (plan_id, key, enabled, limit_value) VALUES ($1, $2, $3, $4)',
          [plan, k, enabled, limit],
        );
      }
      await db.pool.query('UPDATE subscriptions SET plan_id = $1 WHERE organization_id = $2', [
        plan,
        orgId,
      ]);
      invalidate();
    };
    const uploadPng = async (who: string) => {
      const form = new FormData();
      form.append('file', new Blob([PNG], { type: 'image/png' }), 'p.png');
      const res = await fetch(`${base}/api/v1/files/chat-attachments`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token[who]}` },
        body: form,
      });
      return { status: res.status, body: (await res.json()) as Json };
    };
    const operations: Record<string, (who: string) => Promise<{ status: number; body: Json }>> = {
      'reports.export': (who) => as(who, 'GET', '/reports/leads-export'),
      'files.upload': (who) => uploadPng(who),
      'messages.bulk': (who) =>
        as(who, 'POST', '/messages/bulk', {
          lead_ids: [who === 'bAdmin' ? fx.records.leadB1 : fx.records.leadA1],
          channel: 'sms',
          content: 'hi',
        }),
    };

    it.each(Object.keys(operations))(
      'disabling %s blocks only that capability, only in that organization',
      async (feature) => {
        await setPlan(
          fx.orgA.id,
          `matrix-${feature.replace('.', '-')}`,
          FULL.map(([k, e, l]) => [k, k === feature ? false : e, l]),
        );
        try {
          const denied = await operations[feature]!('aAdmin');
          expect(denied.status).toBe(403);
          expect(denied.body.error.code).toBe('FEATURE_NOT_ENABLED');
          for (const other of Object.keys(operations).filter((f) => f !== feature)) {
            const res = await operations[other]!('aAdmin');
            expect(res.body?.error?.code, other).not.toBe('FEATURE_NOT_ENABLED');
          }
          const unaffected = await operations[feature]!('bAdmin');
          expect(unaffected.body?.error?.code).not.toBe('FEATURE_NOT_ENABLED');
        } finally {
          await setPlan(fx.orgA.id, 'matrix-full', FULL);
        }
      },
    );

    it('enforces the storage limit per organization', async () => {
      const used = Number(
        (
          await db.pool.query(
            `SELECT COALESCE((SELECT value FROM usage_counters WHERE organization_id = $1
               AND metric = 'storage.bytes' AND period = 'lifetime'), 0) AS v`,
            [fx.orgA.id],
          )
        ).rows[0].v,
      );
      await setPlan(
        fx.orgA.id,
        'matrix-storage',
        FULL.map(([k, e, l]) => [k, e, k === 'storage.bytes' ? used + PNG.length : l]),
      );
      try {
        expect((await uploadPng('aSales')).status).toBe(201);
        const over = await uploadPng('aSales');
        expect(over.status).toBe(409);
        expect(over.body.error.code).toBe('PLAN_LIMIT_REACHED');
        const other = await uploadPng('bAdmin');
        expect(other.status, JSON.stringify(other.body)).toBe(201);
      } finally {
        await setPlan(fx.orgA.id, 'matrix-full', FULL);
      }
    });
  });

  describe('files', () => {
    const upload = async (who: string, content: Buffer, type: string, name = 'photo.png') => {
      const form = new FormData();
      form.append('file', new Blob([content], { type }), name);
      const res = await fetch(`${base}/api/v1/files/chat-attachments`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token[who]}` },
        body: form,
      });
      return { status: res.status, body: (await res.json()) as Json };
    };
    const usage = async (orgId: number) =>
      Number(
        (
          await db.pool.query(
            `SELECT value FROM usage_counters WHERE organization_id = $1 AND metric = 'storage.bytes' AND period = 'lifetime'`,
            [orgId],
          )
        ).rows[0]?.value ?? 0,
      );

    it('records tenant-scoped metadata with a generated key and a sanitized name', async () => {
      const before = await usage(fx.orgA.id);
      const res = await upload('aSales', PNG, 'image/png', '../../etc/<evil>.png');
      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({
        fileType: 'image/png',
        size: PNG.length,
        name: 'evil.png',
      });
      const row = (
        await db.pool.query('SELECT * FROM files WHERE public_id = $1', [res.body.data.id])
      ).rows[0];
      expect(row).toMatchObject({
        organization_id: fx.orgA.id,
        uploaded_by: fx.users.aSales.id,
        status: 'uploaded',
      });
      expect(row.storage_key).toMatch(
        new RegExp(`^organizations/${fx.orgA.publicId}/chat/attachments/`),
      );
      expect(row.storage_key).not.toContain('etc');
      expect(row.expires_at).not.toBeNull();
      expect(await usage(fx.orgA.id)).toBe(before + PNG.length);
    });

    it('rejects content that does not match the declared type', async () => {
      const res = await upload('aSales', Buffer.from('#!/bin/sh\nrm -rf /'), 'image/png');
      expect(res.status).toBe(400);
      expect((await upload('aSales', PNG, 'application/x-msdownload', 'x.exe')).status).toBe(400);
    });

    it('attaches by file id once, only for the uploader, and deletes metadata-first', async () => {
      const uploaded = (await upload('aSales', PNG, 'image/png')).body.data;
      const conversation = `/chat/conversations/${fx.records.convA}/messages`;
      // Another member (even in the same conversation) cannot use my upload.
      const stolen = await as('aManager', 'POST', conversation, {
        content: 'x',
        file_id: uploaded.id,
      });
      expect(stolen.status).toBe(400);
      const sent = await as('aSales', 'POST', conversation, {
        content: 'photo',
        file_id: uploaded.id,
        attachment_url: 'https://evil.example/x.png',
      });
      expect(sent.status).toBe(201);
      expect(sent.body.data).toMatchObject({
        message_type: 'image',
        file_type: 'image/png',
        file_id: uploaded.id,
      });
      expect(sent.body.data.attachment_url.split('?')[0]).toBe(uploaded.url.split('?')[0]);
      expect(
        (await as('aSales', 'POST', conversation, { content: 'again', file_id: uploaded.id }))
          .status,
      ).toBe(400);

      expect((await as('bAdmin', 'DELETE', `/files/${uploaded.id}`)).status).toBe(404);
      expect((await as('aSales2', 'DELETE', `/files/${uploaded.id}`)).status).toBe(403);
      const before = await usage(fx.orgA.id);
      expect((await as('aSales', 'DELETE', `/files/${uploaded.id}`)).status).toBe(200);
      const file = (
        await db.pool.query('SELECT status, deleted_at FROM files WHERE public_id = $1', [
          uploaded.id,
        ])
      ).rows[0];
      expect(file.status).toBe('deleted');
      const message = (
        await db.pool.query('SELECT attachment_url FROM chat_messages WHERE id = $1', [
          sent.body.data.id,
        ])
      ).rows[0];
      expect(message.attachment_url).toBeNull();
      expect(await usage(fx.orgA.id)).toBe(before - PNG.length);
      expect((await events('file.deleted')).at(-1)).toMatchObject({ organization_id: fx.orgA.id });
      expect((await as('aSales', 'DELETE', `/files/${uploaded.id}`)).status).toBe(404);
    });
  });

  describe('file access (short-lived signed URLs)', () => {
    const verify = async (url: string) => {
      const { fileStorage } = await import('../src/platform/providers.js');
      return (fileStorage() as unknown as { verifySignedUrl(u: string): boolean }).verifySignedUrl(
        url,
      );
    };
    const uploadAs = async (who: string) => {
      const form = new FormData();
      form.append('file', new Blob([PNG], { type: 'image/png' }), 'p.png');
      const res = await fetch(`${base}/api/v1/files/chat-attachments`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token[who]}` },
        body: form,
      });
      return ((await res.json()) as Json).data;
    };

    it('grants only the uploader and conversation participants; everything else is a uniform 404', async () => {
      const uploaded = await uploadAs('aSales');
      expect(await verify(uploaded.url)).toBe(true);
      // Before attaching: only the uploader.
      expect((await as('aManager', 'GET', `/files/${uploaded.id}/url`)).status).toBe(404);
      const own = await as('aSales', 'GET', `/files/${uploaded.id}/url`);
      expect(own.status).toBe(200);
      expect(await verify(own.body.data.url)).toBe(true);
      expect(new Date(own.body.data.expiresAt).getTime()).toBeGreaterThan(Date.now());

      const sent = await as('aSales', 'POST', `/chat/conversations/${fx.records.convA}/messages`, {
        content: 'signed',
        file_id: uploaded.id,
      });
      expect(sent.status).toBe(201);
      expect(await verify(sent.body.data.attachment_url)).toBe(true);

      const participant = await as('aManager', 'GET', `/files/${uploaded.id}/url`);
      expect(participant.status).toBe(200);
      const listed = await as(
        'aManager',
        'GET',
        `/chat/conversations/${fx.records.convA}/messages`,
      );
      const message = listed.body.data.find((m: Json) => m.id === sent.body.data.id);
      expect(await verify(message.attachment_url)).toBe(true);

      const denied = [
        await as('aSales2', 'GET', `/files/${uploaded.id}/url`), // same org, not a participant
        await as('aAdmin', 'GET', `/files/${uploaded.id}/url`), // org admin does not bypass chat privacy
        await as('bAdmin', 'GET', `/files/${uploaded.id}/url`), // other tenant
        await as('aSales', 'GET', `/files/00000000-0000-4000-8000-000000000000/url`), // guessed id
      ];
      for (const res of denied) {
        expect(res.status).toBe(404);
        expect(JSON.stringify(res.body)).not.toContain(uploaded.url.split('?')[0]);
      }
      const shape = (body: Json) => ({ ...body, error: { ...body.error, requestId: undefined } });
      expect(shape(denied[0]!.body)).toEqual(shape(denied[3]!.body));

      // Deleted: no new URLs, and the message no longer carries one.
      expect((await as('aSales', 'DELETE', `/files/${uploaded.id}`)).status).toBe(200);
      expect((await as('aSales', 'GET', `/files/${uploaded.id}/url`)).status).toBe(404);
      const after = await as('aManager', 'GET', `/chat/conversations/${fx.records.convA}/messages`);
      expect(
        after.body.data.find((m: Json) => m.id === sent.body.data.id).attachment_url,
      ).toBeNull();
    });

    it('rejects tampered and expired URLs', async () => {
      const uploaded = await uploadAs('aSales');
      expect(await verify(uploaded.url.replace(/signature=./, 'signature=0'))).toBe(false);
      expect(await verify(uploaded.url.replace(/expires=\d+/, 'expires=1'))).toBe(false);
      expect(await verify(uploaded.url.split('?')[0]!)).toBe(false);
    });
  });

  describe('SMS delivery reports (signed Plivo webhook)', () => {
    const AUTH_TOKEN = process.env.PLIVO_AUTH_TOKEN!;
    const PUBLIC = `${process.env.PLIVO_WEBHOOK_URL}/message-status`;
    const post = async (params: Record<string, string>, sign = true) => {
      const nonce = `n${Math.random().toString(36).slice(2)}`;
      const sorted = Object.keys(params)
        .sort()
        .map((k) => `${k}${params[k]}`)
        .join('');
      const signature = createHmac('sha256', AUTH_TOKEN)
        .update(`${PUBLIC}?${sorted}.${nonce}`)
        .digest('base64');
      return fetch(`${base}/api/plivo/webhook/message-status`, {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          'X-Plivo-Signature-V3-Nonce': nonce,
          ...(sign ? { 'X-Plivo-Signature-V3': signature } : {}),
        },
        body: new URLSearchParams(params).toString(),
      });
    };
    const message = async (
      providerId: string,
      organizationId: number,
      leadId: number,
      userId: number,
    ) =>
      (
        await db.pool.query(
          `INSERT INTO messages (organization_id, lead_id, user_id, message_type, content, status, provider,
                                 provider_message_id, sent_at)
           VALUES ($1, $2, $3, 'SMS', 'x', 'Sent', 'plivo', $4, now()) RETURNING id`,
          [organizationId, leadId, userId, providerId],
        )
      ).rows[0].id;
    const status = async (id: number) =>
      (await db.pool.query('SELECT status, failure_code FROM messages WHERE id = $1', [id]))
        .rows[0];

    it('applies delivery reports forward-only and ignores duplicates and unsigned calls', async () => {
      const a = await message('uuid-a', fx.orgA.id, fx.records.leadA1!, fx.users.aSales.id);
      const b = await message('uuid-b', fx.orgB.id, fx.records.leadB1!, fx.users.bSales.id);
      expect((await post({ MessageUUID: 'uuid-a', Status: 'delivered' }, false)).status).toBe(403);
      expect((await status(a)).status).toBe('Sent');

      expect((await post({ MessageUUID: 'uuid-a', Status: 'delivered' })).status).toBe(200);
      expect((await post({ MessageUUID: 'uuid-a', Status: 'delivered' })).status).toBe(200);
      expect(
        (await post({ MessageUUID: 'uuid-a', Status: 'undelivered', ErrorCode: '30' })).status,
      ).toBe(200);
      expect(await status(a)).toMatchObject({ status: 'Delivered', failure_code: null });
      expect((await status(b)).status).toBe('Sent'); // other tenants' rows untouched

      await post({ MessageUUID: 'uuid-b', Status: 'failed', ErrorCode: '200' });
      expect(await status(b)).toMatchObject({ status: 'Failed', failure_code: 'PROVIDER_200' });
    });
  });

  it('login still works for every tenant after the runtime changes', async () => {
    const res = await call(base, 'POST', '/api/v1/auth/login', {
      body: { email: fx.users.bAdmin.email, password: PASSWORD, client: 'mobile' },
    });
    expect(res.status).toBe(200);
  });
});
