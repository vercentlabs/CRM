import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestSchema, hasTestDatabase, type TestSchema } from './helpers/db.js';
import { seedTenants, type TenantFixture } from './helpers/fixtures.js';
import { call, loginMobile, startApp, type TestServer } from './helpers/http.js';

/**
 * Legacy (deprecated) endpoints and /api/v1 are adapters over the same
 * services: they must agree on data, permissions and tenant isolation.
 */
describe.skipIf(!hasTestDatabase)('legacy ⇄ /api/v1 compatibility', () => {
  let db: TestSchema;
  let server: TestServer;
  let fx: TenantFixture;
  let base: string;
  const token: Record<string, string> = {};

  const legacy = (who: string, method: string, path: string, body?: unknown) =>
    call(base, method, path, { token: token[who]!, ...(body === undefined ? {} : { body }) });
  const v1 = (who: string, method: string, path: string, body?: unknown) =>
    legacy(who, method, `/api/v1${path}`, body);
  const ids = (rows: Array<{ id: number }>) => rows.map((r) => r.id).sort((a, b) => a - b);

  beforeAll(async () => {
    db = await createTestSchema('crm_compat');
    fx = await seedTenants(db.pool);
    process.env.DATABASE_URL = db.url;
    server = await startApp();
    base = server.baseUrl;
    for (const who of ['aAdmin', 'aManager', 'aSales', 'bAdmin', 'bSales'] as const) {
      token[who] = (await loginMobile(base, fx.users[who].email)).accessToken;
    }
  });

  afterAll(async () => {
    await server?.close();
    await db?.drop();
  });

  it('marks legacy responses as deprecated and v1 responses not', async () => {
    const old = await legacy('aSales', 'GET', `/leads/${fx.records.leadA1}`);
    expect(old.headers.get('deprecation')).toBe('true');
    const current = await v1('aSales', 'GET', `/leads/${fx.records.leadA1}`);
    expect(current.headers.get('deprecation')).toBeNull();
    expect(old.body.lead).toEqual(current.body.data);
  });

  it('returns the same visible records for list endpoints', async () => {
    for (const who of ['aSales', 'aManager']) {
      const oldLeads = await legacy(who, 'GET', '/leads?limit=100');
      const newLeads = await v1(who, 'GET', '/leads?limit=100');
      expect(ids(oldLeads.body.leads)).toEqual(ids(newLeads.body.data));
      expect(oldLeads.body.pagination.totalItems).toBe(newLeads.body.meta.pagination.total);

      const oldCustomers = await legacy(who, 'GET', '/customers');
      const newCustomers = await v1(who, 'GET', '/customers?limit=100');
      expect(ids(oldCustomers.body.data.customers)).toEqual(ids(newCustomers.body.data));

      const oldOpps = await legacy(who, 'GET', '/opportunities?limit=100');
      const newOpps = await v1(who, 'GET', '/opportunities?limit=100');
      expect(ids(oldOpps.body.opportunities)).toEqual(ids(newOpps.body.data));

      const oldTasks = await legacy(who, 'GET', '/tasks');
      const newTasks = await v1(who, 'GET', '/tasks?limit=100');
      expect(ids(oldTasks.body.tasks)).toEqual(ids(newTasks.body.data));

      const oldEvents = await legacy(who, 'GET', '/calendar');
      const newEvents = await v1(who, 'GET', '/calendar/events');
      expect(ids(oldEvents.body.events)).toEqual(ids(newEvents.body.data));

      const oldNotes = await legacy(who, 'GET', '/notes');
      const newNotes = await v1(who, 'GET', '/notes?limit=100');
      expect(ids(oldNotes.body.notes)).toEqual(ids(newNotes.body.data));
    }
  });

  it('agrees on reports and settings', async () => {
    for (const who of ['aSales', 'aManager']) {
      const old = await legacy(who, 'GET', '/reports/dashboard-summary');
      const current = await v1(who, 'GET', '/reports/dashboard-summary');
      expect(old.body).toEqual(current.body.data);
      const oldAging = await legacy(who, 'GET', '/reports/lead-aging');
      expect(oldAging.body).toEqual((await v1(who, 'GET', '/reports/lead-aging')).body.data);
    }
    const oldSettings = await legacy('aAdmin', 'GET', '/settings');
    expect(oldSettings.body.data.settings).toEqual(
      (await v1('aAdmin', 'GET', '/settings')).body.data,
    );
    const oldUsers = await legacy('aAdmin', 'GET', '/users');
    const members = await v1('aAdmin', 'GET', '/organization/members?limit=100');
    expect(ids(oldUsers.body.users)).toEqual(ids(members.body.data));
  });

  it('shares one implementation for lead messages under both legacy paths', async () => {
    const sent = await legacy('aSales', 'POST', '/api/lead-messages/send', {
      leadId: fx.records.leadA1,
      channel: 'sms',
      content: 'hello',
    });
    expect(sent.status).toBe(201);
    const viaMessages = await legacy('aSales', 'GET', '/messages');
    const viaLeadMessages = await legacy('aSales', 'GET', '/api/lead-messages');
    const viaV1 = await v1('aSales', 'GET', '/messages?limit=100');
    expect(ids(viaMessages.body.messages)).toEqual(ids(viaLeadMessages.body.messages));
    expect(ids(viaMessages.body.messages)).toEqual(ids(viaV1.body.data));
  });

  it('applies the same permission, scope and tenant outcomes', async () => {
    const cases: Array<[string, string, string, string, number]> = [
      ['aSales', 'GET', `/leads/${fx.records.leadA2}`, `/leads/${fx.records.leadA2}`, 403],
      ['bAdmin', 'GET', `/leads/${fx.records.leadA1}`, `/leads/${fx.records.leadA1}`, 404],
      ['bAdmin', 'GET', `/opportunities?limit=100`, `/opportunities?limit=100`, 200],
      [
        'bAdmin',
        'DELETE',
        `/customers/${fx.records.customerA}`,
        `/customers/${fx.records.customerA}`,
        404,
      ],
      ['bAdmin', 'DELETE', `/tasks/${fx.records.taskA}`, `/tasks/${fx.records.taskA}`, 404],
      ['bSales', 'GET', `/notes/${fx.records.noteA}`, `/notes/${fx.records.noteA}`, 404],
      ['aSales', 'GET', `/notes/${fx.records.noteA2}`, `/notes/${fx.records.noteA2}`, 403],
      ['aManager', 'GET', '/settings', '/settings', 403],
      ['aManager', 'GET', '/audit', '/audit-logs', 403],
      ['aSales', 'GET', '/reports/sales-performance', '/reports/sales-performance', 403],
      [
        'bAdmin',
        'DELETE',
        `/sales-locations/${fx.records.locationA}`,
        `/locations/${fx.records.locationA}`,
        404,
      ],
    ];
    for (const [who, method, oldPath, newPath, status] of cases) {
      const old = await legacy(who, method, oldPath);
      const current = await v1(who, method, newPath);
      expect([oldPath, old.status]).toEqual([oldPath, status]);
      expect([newPath, current.status]).toEqual([newPath, status]);
      if (status >= 400) {
        expect(old.body).toMatchObject({ success: false, message: expect.any(String) });
        expect(current.body).toMatchObject({ success: false, error: { code: expect.any(String) } });
      }
    }
  });

  it('writes through legacy are visible through v1 (and vice versa)', async () => {
    const created = await legacy('aSales', 'POST', '/leads', {
      full_name: 'Compat Lead',
      mobile_number: '9555501234',
    });
    expect(created.status).toBe(201);
    const id = created.body.lead.id;
    expect((await v1('aSales', 'GET', `/leads/${id}`)).body.data.full_name).toBe('Compat Lead');

    const updated = await v1('aSales', 'PATCH', `/leads/${id}`, { status: 'Contacted' });
    expect(updated.status).toBe(200);
    expect((await legacy('aSales', 'GET', `/leads/${id}`)).body.lead.status).toBe('Contacted');

    const note = await v1('aSales', 'POST', '/notes', { title: 'v1', content: 'note' });
    expect((await legacy('aSales', 'DELETE', `/notes/${note.body.data.id}`)).status).toBe(200);
    expect((await v1('aSales', 'GET', `/notes/${note.body.data.id}`)).status).toBe(404);
  });

  it('keeps legacy validation messages in the historical shape', async () => {
    const res = await legacy('aSales', 'POST', '/customers', { name: 'x' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(typeof res.body.message).toBe('string');
    const login = await call(base, 'POST', '/auth/login', { body: { email: 'not-an-email' } });
    expect(login.status).toBe(400);
    expect(login.body.message).toBe('Validation failed');
  });
});
