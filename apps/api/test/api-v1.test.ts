import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestSchema, hasTestDatabase, type TestSchema } from './helpers/db.js';
import { seedTenants, type TenantFixture } from './helpers/fixtures.js';
import { call, loginMobile, startApp, type ApiResult, type TestServer } from './helpers/http.js';

/**
 * /api/v1 contract: standard envelopes, validation before any service code,
 * authentication, permissions, ownership scope (403), tenant isolation (404)
 * and pagination for every CRM module.
 */
describe.skipIf(!hasTestDatabase)('/api/v1 modules', () => {
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

  const expectError = (res: ApiResult, status: number, code: string) => {
    expect(res.status).toBe(status);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe(code);
    expect(typeof res.body.error.requestId).toBe('string');
    expect(JSON.stringify(res.body)).not.toMatch(
      /at .*\.(ts|js):\d+|relation "|syntax error|duplicate key/,
    );
  };

  const expectPage = (res: ApiResult) => {
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    const p = res.body.meta.pagination;
    expect(p).toEqual({
      page: expect.any(Number),
      limit: expect.any(Number),
      total: expect.any(Number),
      totalPages: Math.ceil(p.total / p.limit),
    });
    return res.body.data as Array<Record<string, unknown>>;
  };

  beforeAll(async () => {
    db = await createTestSchema('crm_v1');
    fx = await seedTenants(db.pool);
    process.env.DATABASE_URL = db.url;
    server = await startApp();
    base = server.baseUrl;
    for (const who of ['aAdmin', 'aManager', 'aSales', 'aSales2', 'bAdmin', 'bSales'] as const) {
      token[who] = (await loginMobile(base, fx.users[who].email)).accessToken;
    }
    const calls = await import('../src/modules/calls/calls.service.js');
    calls.useTelephony({
      dial: async ({ to }) => {
        if (to.endsWith('0000000000')) throw new Error('provider down');
        return { callUuid: `fake-${Date.now()}` };
      },
      bridgeXml: () => '<Response/>',
    });
  });

  afterAll(async () => {
    await server?.close();
    await db?.drop();
  });

  describe('platform', () => {
    it('serves metadata without secrets', async () => {
      const res = await call(base, 'GET', '/api/v1');
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({
        name: 'CRM API',
        version: expect.any(String),
        openapi: '/api/v1/openapi.json',
        build: { version: expect.any(String), commit: expect.any(String) },
      });
    });

    it('serves the OpenAPI document publicly', async () => {
      const res = await call(base, 'GET', '/api/v1/openapi.json');
      expect(res.status).toBe(200);
      expect(res.body.openapi).toBe('3.1.0');
      expect(Object.keys(res.body.paths)).toEqual(
        expect.arrayContaining(['/leads', '/leads/{id}', '/auth/login']),
      );
    });

    it('answers unknown v1 routes with the error envelope', async () => {
      expectError(await as('aAdmin', 'GET', '/nope'), 404, 'NOT_FOUND');
    });

    it('rejects unauthenticated requests on every module', async () => {
      for (const path of [
        '/leads',
        '/customers',
        '/opportunities',
        '/tasks',
        '/calendar/events',
        '/followups',
        '/notes',
        '/calls',
        '/messages',
        '/chat/conversations',
        '/locations',
        '/reports/dashboard-summary',
        '/settings',
        '/audit-logs',
        '/organization/members',
        '/market/gold-rate',
      ]) {
        expectError(await call(base, 'GET', `/api/v1${path}`), 401, 'UNAUTHENTICATED');
      }
    });
  });

  describe('leads', () => {
    it('lists with pagination, allowlisted sort and own scope', async () => {
      const all = expectPage(await as('aManager', 'GET', '/leads?limit=2&page=1&sort=full_name'));
      expect(all).toHaveLength(2);
      expect(all.every((l) => String(l.full_name).startsWith('Alpha'))).toBe(true);
      const own = expectPage(await as('aSales', 'GET', '/leads?limit=100'));
      expect(own.map((l) => l.id)).toEqual([fx.records.leadA1]);
      expectError(
        await as('aManager', 'GET', '/leads?sort=password_hash'),
        400,
        'VALIDATION_FAILED',
      );
      expectError(await as('aManager', 'GET', '/leads?limit=1000'), 400, 'VALIDATION_FAILED');
    });

    it('treats search input as data, not SQL or wildcards', async () => {
      expect(
        expectPage(
          await as('aManager', 'GET', `/leads?search=${encodeURIComponent("%' OR 1=1 --")}`),
        ),
      ).toHaveLength(0);
      expect(expectPage(await as('aManager', 'GET', '/leads?search=%25'))).toHaveLength(0);
      expect(expectPage(await as('aManager', 'GET', '/leads?search=lead%20two'))).toHaveLength(1);
    });

    it('gets, 403s outside own scope, 404s across tenants and for missing ids', async () => {
      const ok = await as('aSales', 'GET', `/leads/${fx.records.leadA1}`);
      expect(ok.status).toBe(200);
      expect(ok.body.data).toMatchObject({ id: fx.records.leadA1, full_name: 'Alpha Lead One' });
      expect(ok.body.data).not.toHaveProperty('organization_id');
      expectError(await as('aSales', 'GET', `/leads/${fx.records.leadA2}`), 403, 'FORBIDDEN');
      expectError(await as('bAdmin', 'GET', `/leads/${fx.records.leadA1}`), 404, 'NOT_FOUND');
      expectError(await as('aAdmin', 'GET', '/leads/99999999'), 404, 'NOT_FOUND');
      expectError(await as('aAdmin', 'GET', '/leads/abc'), 400, 'VALIDATION_FAILED');
    });

    it('validates bodies and ignores client organization ids', async () => {
      expectError(
        await as('aSales', 'POST', '/leads', { full_name: 'X' }),
        400,
        'VALIDATION_FAILED',
      );
      const created = await as('aSales', 'POST', '/leads', {
        full_name: 'V1 Lead',
        mobile_number: '9123456780',
        organization_id: fx.orgB.id,
      });
      expect(created.status).toBe(201);
      const row = await db.pool.query(
        'SELECT organization_id, assigned_to FROM leads WHERE id = $1',
        [created.body.data.id],
      );
      expect(row.rows[0]).toEqual({ organization_id: fx.orgA.id, assigned_to: fx.users.aSales.id });
      expectError(
        await as('aSales', 'PATCH', `/leads/${created.body.data.id}`, {}),
        400,
        'VALIDATION_FAILED',
      );
      const patched = await as('aSales', 'PATCH', `/leads/${created.body.data.id}`, {
        status: 'Contacted',
      });
      expect(patched.body.data.status).toBe('Contacted');
    });

    it('assigns only to members of the same organization', async () => {
      expectError(
        await as('aSales', 'PUT', `/leads/${fx.records.leadA1}/assignment`, {
          assigned_to: fx.users.aSales2.id,
        }),
        403,
        'FORBIDDEN',
      );
      expectError(
        await as('aManager', 'PUT', `/leads/${fx.records.leadA1}/assignment`, {
          assigned_to: fx.users.bSales.id,
        }),
        400,
        'VALIDATION_FAILED',
      );
      expectError(
        await as('bAdmin', 'PUT', `/leads/${fx.records.leadA1}/assignment`, {
          assigned_to: fx.users.bSales.id,
        }),
        404,
        'NOT_FOUND',
      );
      const res = await as('aManager', 'PUT', `/leads/${fx.records.leadA3}/assignment`, {
        assigned_to: fx.users.aSales.id,
      });
      expect(res.status).toBe(200);
      expect(res.body.data.assigned_to).toBe(fx.users.aSales.id);
      await as('aManager', 'PUT', `/leads/${fx.records.leadA3}/assignment`, {
        assigned_to: fx.users.aSales2.id,
      });
    });

    it('converts a lead into a customer atomically', async () => {
      const lead = await as('aManager', 'POST', '/leads', {
        full_name: 'Convert Me',
        mobile_number: '9000000001',
        email: 'convert@lead.test',
      });
      const res = await as('aManager', 'PATCH', `/leads/${lead.body.data.id}`, {
        status: 'Converted',
      });
      expect(res.status).toBe(200);
      const customers = await db.pool.query(
        'SELECT organization_id FROM customers WHERE email = $1',
        ['convert@lead.test'],
      );
      expect(customers.rows).toEqual([{ organization_id: fx.orgA.id }]);
    });

    it('schedules follow-ups for visible leads only', async () => {
      const future = new Date(Date.now() + 86_400_000).toISOString();
      const res = await as('aSales', 'POST', `/leads/${fx.records.leadA1}/followups`, {
        scheduled_at: future,
      });
      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({
        lead_id: fx.records.leadA1,
        followup_type: 'Call',
        status: 'Pending',
      });
      expectError(
        await as('aSales', 'POST', `/leads/${fx.records.leadA1}/followups`, {
          scheduled_at: '2000-01-01T00:00:00Z',
        }),
        400,
        'VALIDATION_FAILED',
      );
      expectError(
        await as('bSales', 'POST', `/leads/${fx.records.leadA1}/followups`, {
          scheduled_at: future,
        }),
        404,
        'NOT_FOUND',
      );
    });
  });

  describe('customers', () => {
    it('covers list/get/create/update/delete with scope and tenancy', async () => {
      const own = expectPage(await as('aSales', 'GET', '/customers'));
      expect(own.map((c) => c.id)).toEqual([fx.records.customerA]);
      expectError(
        await as('bAdmin', 'GET', `/customers/${fx.records.customerA}`),
        404,
        'NOT_FOUND',
      );
      expectError(
        await as('aSales', 'POST', '/customers', { name: 'No email' }),
        400,
        'VALIDATION_FAILED',
      );
      expectError(
        await as('aSales', 'POST', '/customers', {
          name: 'V1 Customer',
          email: 'v1@customer.test',
          assigned_to: fx.users.aManager.id,
        }),
        403,
        'FORBIDDEN',
      );
      const created = await as('aSales', 'POST', '/customers', {
        name: 'V1 Customer',
        email: 'v1@customer.test',
      });
      expect(created.status).toBe(201);
      expect(created.body.data.assigned_to).toBe(fx.users.aSales.id); // own scope assigns to self
      expectError(
        await as('aSales', 'POST', '/customers', { name: 'Dup', email: 'v1@customer.test' }),
        409,
        'CONFLICT',
      );
      const updated = await as('aSales', 'PATCH', `/customers/${created.body.data.id}`, {
        phone: '9876501234',
      });
      expect(updated.body.data.phone).toBe('9876501234');
      expectError(
        await as('aSales', 'DELETE', `/customers/${created.body.data.id}`),
        403,
        'FORBIDDEN',
      );
      expectError(
        await as('bAdmin', 'DELETE', `/customers/${created.body.data.id}`),
        404,
        'NOT_FOUND',
      );
      expect((await as('aAdmin', 'DELETE', `/customers/${created.body.data.id}`)).status).toBe(200);
    });
  });

  describe('opportunities', () => {
    it('validates the lead against tenant and scope', async () => {
      expectError(
        await as('aSales', 'POST', '/opportunities', {
          lead_id: fx.records.leadB1,
          title: 'Steal',
        }),
        404,
        'NOT_FOUND',
      );
      expectError(
        await as('aSales', 'POST', '/opportunities', {
          lead_id: fx.records.leadA2,
          title: 'Not mine',
        }),
        404,
        'NOT_FOUND',
      );
      const created = await as('aSales', 'POST', '/opportunities', {
        lead_id: fx.records.leadA1,
        title: 'Mine',
        stage: 'Proposal',
      });
      expect(created.status).toBe(201);
      expect(created.body.data).toMatchObject({
        stage: 'Proposal',
        assigned_to: fx.users.aSales.id,
      });
      expectPage(await as('aManager', 'GET', '/opportunities?stage=Proposal'));
      expectError(
        await as('aManager', 'PATCH', `/opportunities/${created.body.data.id}`, {
          stage: 'Negotiation',
        }),
        403,
        'FORBIDDEN',
      );
      expectError(
        await as('bAdmin', 'GET', `/opportunities/${created.body.data.id}`),
        404,
        'NOT_FOUND',
      );
      expectError(
        await as('aManager', 'PUT', `/opportunities/${created.body.data.id}/assignment`, {
          assigned_to: fx.users.bAdmin.id,
        }),
        400,
        'VALIDATION_FAILED',
      );
    });
  });

  describe('tasks and calendar', () => {
    it('shares one task store between /tasks and /calendar/events', async () => {
      const tasks = expectPage(await as('aSales', 'GET', '/tasks'));
      expect(tasks.map((t) => t.id)).toEqual([fx.records.taskA]);
      const event = await as('aSales', 'POST', '/calendar/events', {
        title: 'Demo',
        start_date: new Date(Date.now() + 3_600_000).toISOString(),
      });
      expect(event.status).toBe(201);
      expect(event.body.data).toMatchObject({ event_type: 'task', user_id: fx.users.aSales.id });
      const asTask = await as('aSales', 'GET', `/tasks/${event.body.data.id}`);
      expect(asTask.body.data.title).toBe('Demo');
      const events = await as('aSales', 'GET', '/calendar/events');
      expect(events.body.data.map((e: { id: number }) => e.id)).toContain(event.body.data.id);
      expectError(await as('aSales', 'GET', `/tasks/${fx.records.taskA2}`), 403, 'FORBIDDEN');
      expectError(
        await as('bAdmin', 'PATCH', `/tasks/${fx.records.taskA}`, { status: 'completed' }),
        404,
        'NOT_FOUND',
      );
      expectError(
        await as('aSales', 'POST', '/tasks', { title: 'x', due_date: 'not a date' }),
        400,
        'VALIDATION_FAILED',
      );
      expectError(
        await as('aSales', 'DELETE', `/calendar/events/${event.body.data.id}`),
        403,
        'FORBIDDEN',
      );
      expect(
        (await as('aManager', 'DELETE', `/calendar/events/${event.body.data.id}`)).status,
      ).toBe(200);
    });
  });

  describe('followups', () => {
    it('lists the schedule and completes follow-ups within tenant and scope', async () => {
      const schedule = await as('aSales', 'GET', '/followups');
      expect(schedule.status).toBe(200);
      expect(
        schedule.body.data.every((item: { lead_id: number }) => item.lead_id === fx.records.leadA1),
      ).toBe(true);
      expectError(
        await as('bSales', 'POST', `/followups/${fx.records.followupA}/complete`),
        404,
        'NOT_FOUND',
      );
      const done = await as('aSales', 'POST', `/followups/${fx.records.followupA}/complete`);
      expect(done.status).toBe(200);
      expect(done.body.data.status).toBe('Completed');
    });
  });

  describe('notes', () => {
    it('keeps notes author-owned and soft-deletes', async () => {
      const mine = expectPage(await as('aSales', 'GET', '/notes'));
      expect(mine.map((n) => n.id)).toEqual([fx.records.noteA]);
      expectError(await as('aSales', 'GET', `/notes/${fx.records.noteA2}`), 403, 'FORBIDDEN');
      expectError(await as('bSales', 'GET', `/notes/${fx.records.noteA}`), 404, 'NOT_FOUND');
      const created = await as('aSales', 'POST', '/notes', {
        title: 'T',
        content: 'C',
        tags: ['a', 'b'],
      });
      expect(created.status).toBe(201);
      expect(created.body.data.tags).toEqual(['a', 'b']);
      expect(expectPage(await as('aSales', 'GET', '/notes?tags=b')).map((n) => n.id)).toEqual([
        created.body.data.id,
      ]);
      expect((await as('aSales', 'DELETE', `/notes/${created.body.data.id}`)).status).toBe(200);
      expectError(await as('aSales', 'GET', `/notes/${created.body.data.id}`), 404, 'NOT_FOUND');
      const row = await db.pool.query('SELECT is_deleted FROM notes WHERE id = $1', [
        created.body.data.id,
      ]);
      expect(row.rows[0].is_deleted).toBe(true);
    });
  });

  describe('calls', () => {
    it('initiates through the telephony adapter and records provider failures', async () => {
      expectError(
        await as('aSales', 'POST', '/calls', { lead_id: fx.records.leadB1 }),
        404,
        'NOT_FOUND',
      );
      expectError(await as('aSales', 'POST', '/calls', {}), 400, 'VALIDATION_FAILED');
      const call1 = await as('aSales', 'POST', '/calls', { lead_id: fx.records.leadA1 });
      expect(call1.status).toBe(201);
      expect(call1.body.data).toMatchObject({
        lead_id: fx.records.leadA1,
        user_id: fx.users.aSales.id,
        call_status: 'Scheduled',
      });
      expect(call1.body.data.plivo_call_uuid).toMatch(/^fake-/);
      const ended = await as('aSales', 'POST', `/calls/${call1.body.data.id}/end`, {
        notes: 'done',
      });
      expect(ended.status).toBe(200);
      expect(ended.body.data.call_status).toBe('Completed');
      expectError(
        await as('bSales', 'POST', `/calls/${call1.body.data.id}/end`, {}),
        404,
        'NOT_FOUND',
      );
      expect(
        expectPage(await as('aSales', 'GET', '/calls')).every(
          (c) => c.user_id === fx.users.aSales.id,
        ),
      ).toBe(true);

      const broken = await as('aManager', 'POST', '/leads', {
        full_name: 'Unreachable',
        mobile_number: '0000000000',
      });
      const failed = await as('aManager', 'POST', '/calls', { lead_id: broken.body.data.id });
      expectError(failed, 503, 'SERVICE_UNAVAILABLE');
      const row = await db.pool.query('SELECT call_status FROM calls WHERE lead_id = $1', [
        broken.body.data.id,
      ]);
      expect(row.rows).toEqual([{ call_status: 'Cancelled' }]);
    });
  });

  describe('messages', () => {
    it('sends to visible leads with the channel mapping and all-or-nothing bulk', async () => {
      const sent = await as('aSales', 'POST', '/messages', {
        lead_id: fx.records.leadA1,
        channel: 'whatsapp',
        content: 'Hi',
      });
      expect(sent.status).toBe(201);
      // Accepted, not yet sent: the worker calls the provider (see apps/worker tests).
      expect(sent.body.data).toMatchObject({
        message_type: 'WhatsApp',
        status: 'Queued',
        sent_at: null,
      });
      const event = await db.pool.query(
        `SELECT organization_id, event_type, payload FROM outbox_events
         WHERE event_type = 'message.requested' AND aggregate_id = $1`,
        [String(sent.body.data.id)],
      );
      expect(event.rows).toEqual([
        {
          organization_id: fx.orgA.id,
          event_type: 'message.requested',
          payload: { messageId: sent.body.data.id, leadId: fx.records.leadA1, channel: 'whatsapp' },
        },
      ]);
      expectError(
        await as('aSales', 'POST', '/messages', {
          lead_id: fx.records.leadA2,
          channel: 'sms',
          content: 'x',
        }),
        404,
        'NOT_FOUND',
      );
      expectError(
        await as('aSales', 'POST', '/messages', {
          lead_id: fx.records.leadA1,
          channel: 'pigeon',
          content: 'x',
        }),
        400,
        'VALIDATION_FAILED',
      );
      const before = Number((await db.pool.query('SELECT COUNT(*) FROM messages')).rows[0].count);
      expectError(
        await as('aManager', 'POST', '/messages/bulk', {
          lead_ids: [fx.records.leadA1, fx.records.leadB1],
          channel: 'sms',
          content: 'x',
        }),
        404,
        'NOT_FOUND',
      );
      expect(Number((await db.pool.query('SELECT COUNT(*) FROM messages')).rows[0].count)).toBe(
        before,
      );
      const bulk = await as('aManager', 'POST', '/messages/bulk', {
        lead_ids: [fx.records.leadA1, fx.records.leadA2],
        channel: 'sms',
        content: 'x',
      });
      expect(bulk.status).toBe(201);
      expectError(
        await as('bSales', 'PATCH', `/messages/${sent.body.data.id}/status`, {
          status: 'Delivered',
        }),
        404,
        'NOT_FOUND',
      );
      expect(
        (
          await as('aSales', 'PATCH', `/messages/${sent.body.data.id}/status`, {
            status: 'Delivered',
          })
        ).body.data.status,
      ).toBe('Delivered');
      expect(
        expectPage(await as('aSales', 'GET', `/messages?lead_id=${fx.records.leadA1}`)).length,
      ).toBeGreaterThan(0);
    });
  });

  describe('chat', () => {
    it('requires participation even for organization-wide roles', async () => {
      expect(
        (await as('aSales', 'GET', `/chat/conversations/${fx.records.convA}/messages`)).status,
      ).toBe(200);
      expectError(
        await as('aAdmin', 'GET', `/chat/conversations/${fx.records.convA}/messages`),
        404,
        'NOT_FOUND',
      );
      expectError(
        await as('bAdmin', 'POST', `/chat/conversations/${fx.records.convA}/messages`, {
          content: 'hi',
        }),
        404,
        'NOT_FOUND',
      );
      expectError(
        await as('aSales', 'POST', '/chat/conversations', {
          is_group: false,
          participant_ids: [fx.users.bSales.id],
        }),
        400,
        'VALIDATION_FAILED',
      );
      const direct = await as('aSales', 'POST', '/chat/conversations', {
        is_group: false,
        participant_ids: [fx.users.aSales2.id],
      });
      expect(direct.status).toBe(201);
      expectError(
        await as('aSales', 'POST', '/chat/conversations', {
          is_group: false,
          participant_ids: [fx.users.aSales2.id],
        }),
        409,
        'CONFLICT',
      );
      const msg = await as(
        'aSales2',
        'POST',
        `/chat/conversations/${direct.body.data.id}/messages`,
        { content: 'hello' },
      );
      expect(msg.status).toBe(201);
      const list = await as('aSales', 'GET', '/chat/conversations');
      expect(
        list.body.data.some(
          (c: { id: number; unread_count: number }) =>
            c.id === direct.body.data.id && c.unread_count === 1,
        ),
      ).toBe(true);
    });
  });

  describe('locations', () => {
    it('manages locations with manager tenancy checks and check-ins', async () => {
      expectError(await as('aManager', 'POST', '/locations', { name: 'X' }), 403, 'FORBIDDEN');
      expectError(
        await as('aAdmin', 'POST', '/locations', { name: 'X', manager_id: fx.users.bAdmin.id }),
        400,
        'VALIDATION_FAILED',
      );
      const created = await as('aAdmin', 'POST', '/locations', {
        name: 'V1 Office',
        manager_id: fx.users.aManager.id,
      });
      expect(created.status).toBe(201);
      expectError(
        await as('bAdmin', 'GET', `/locations/${created.body.data.id}`),
        404,
        'NOT_FOUND',
      );
      const checkIn = await as('aSales', 'PUT', '/locations/me', {
        latitude: 19.07,
        longitude: 72.87,
      });
      expect(checkIn.status).toBe(200);
      const executives = await as('aManager', 'GET', '/locations/executives');
      expect(executives.body.data.map((e: { id: number }) => e.id)).toContain(fx.users.aSales.id);
      expect((await as('aAdmin', 'DELETE', `/locations/${created.body.data.id}`)).status).toBe(200);
    });
  });

  describe('reports', () => {
    it('validates filters and keeps own-scope reports to own data', async () => {
      expectError(
        await as('aManager', 'GET', '/reports/sales-performance?days=0'),
        400,
        'VALIDATION_FAILED',
      );
      expectError(
        await as('aManager', 'GET', '/reports/leads-over-time?period=century'),
        400,
        'VALIDATION_FAILED',
      );
      expectError(await as('aSales', 'GET', '/reports/sales-performance'), 403, 'FORBIDDEN');
      const summary = await as('aSales', 'GET', '/reports/dashboard-summary');
      expect(summary.status).toBe(200);
      const orgSummary = await as('bAdmin', 'GET', '/reports/dashboard-summary');
      expect(JSON.stringify(orgSummary.body)).not.toContain('Alpha');
      const perf = await as('aManager', 'GET', '/reports/sales-performance?days=30');
      expect(perf.status).toBe(200);
      const csv = await as('aManager', 'GET', '/reports/leads-export');
      expect(csv.status).toBe(200);
      expect(csv.headers.get('content-type')).toContain('text/csv');
      expect(String(csv.body)).not.toContain('Beta');
    });
  });

  describe('settings, audit, organization', () => {
    it('keeps settings tenant-owned and admin-only', async () => {
      expectError(await as('aManager', 'GET', '/settings'), 403, 'FORBIDDEN');
      const settings = await as('aAdmin', 'GET', '/settings');
      expect(JSON.stringify(settings.body.data)).toContain('Alpha Settings');
      expectError(
        await as('aAdmin', 'PATCH', '/settings', { settings: { 'Bad Key': 1 } }),
        400,
        'VALIDATION_FAILED',
      );
      const updated = await as('aAdmin', 'PATCH', '/settings', {
        settings: { timezone: 'Asia/Kolkata' },
      });
      expect(updated.status).toBe(200);
      const other = await as('bAdmin', 'GET', '/settings');
      expect(JSON.stringify(other.body.data)).not.toContain('Asia/Kolkata');
    });

    it('validates the organization time zone and exposes it in the session', async () => {
      for (const timezone of ['Mars/Olympus', 'UTC+5', '', 42]) {
        expectError(
          await as('aAdmin', 'PATCH', '/settings', { settings: { timezone } }),
          400,
          'VALIDATION_FAILED',
        );
      }
      expect(
        (await as('aAdmin', 'PATCH', '/settings', { settings: { timezone: 'America/New_York' } }))
          .status,
      ).toBe(200);
      expect((await as('aSales', 'GET', '/auth/session')).body.data.organization.timezone).toBe(
        'America/New_York',
      );
      expect((await as('bAdmin', 'GET', '/auth/session')).body.data.organization.timezone).toBe(
        'UTC',
      );
      // A corrupt stored value never breaks the session: it falls back to UTC.
      await db.pool.query(
        `UPDATE settings SET value = '"Not/AZone"' WHERE organization_id = $1 AND key = 'timezone'`,
        [fx.orgA.id],
      );
      expect((await as('aSales', 'GET', '/auth/session')).body.data.organization.timezone).toBe(
        'UTC',
      );
      await as('aAdmin', 'PATCH', '/settings', { settings: { timezone: 'Asia/Kolkata' } });
    });

    it('lists the audit log of the organization only, paginated', async () => {
      const entries = expectPage(await as('aAdmin', 'GET', '/audit-logs?limit=100'));
      expect(entries.some((e) => e.action === 'UPDATE_SETTINGS')).toBe(true);
      expect(JSON.stringify(entries)).not.toContain('Beta Settings');
      expectError(await as('aManager', 'GET', '/audit-logs'), 403, 'FORBIDDEN');
    });

    it('adds members through v1 with escalation checks', async () => {
      expectError(
        await as('aAdmin', 'POST', '/organization/members', {
          full_name: 'x',
          email: 'bad',
          password: 'Passw0rd123',
          roleKey: 'sales',
        }),
        400,
        'VALIDATION_FAILED',
      );
      const created = await as('aAdmin', 'POST', '/organization/members', {
        full_name: 'V1 Rep',
        email: 'v1rep@example.test',
        password: 'Passw0rd123',
        roleKey: 'sales',
      });
      expect(created.status).toBe(201);
      expect(created.body.data).toMatchObject({ role_key: 'sales', membership_status: 'active' });
      expectError(
        await as('aManager', 'POST', '/organization/members', {
          full_name: 'x',
          email: 'x@example.test',
          password: 'Passw0rd123',
          roleKey: 'admin',
        }),
        403,
        'FORBIDDEN',
      );
      const members = expectPage(await as('aAdmin', 'GET', '/organization/members?limit=5'));
      expect(members).toHaveLength(5);
    });
  });
});
