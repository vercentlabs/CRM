import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestSchema, hasTestDatabase, type TestSchema } from './helpers/db.js';
import { seedTenants, type TenantFixture } from './helpers/fixtures.js';
import { call, loginMobile, startApp, type Json, type TestServer } from './helpers/http.js';

/**
 * Organization A must never read, change, delete, report on or message
 * Organization B's data (and vice versa) through any `/api/v1` route.
 * Foreign-tenant ids answer 404 so existence is never revealed.
 */
describe.skipIf(!hasTestDatabase)('tenant isolation (real HTTP + PostgreSQL)', () => {
  let db: TestSchema;
  let server: TestServer;
  let fx: TenantFixture;
  const token: Record<string, string> = {};
  let base: string;

  const as = (who: string, method: string, path: string, body?: unknown) =>
    call(base, method, `/api/v1${path}`, {
      token: token[who]!,
      ...(body === undefined ? {} : { body }),
    });
  const ids = (res: { body: Json }) => (res.body.data as { id: number }[]).map((row) => row.id);

  beforeAll(async () => {
    db = await createTestSchema('crm_tenancy');
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

  const count = async (sql: string, params: unknown[]) =>
    Number((await db.pool.query(sql, params)).rows[0].count);

  describe('leads', () => {
    it('lets org A members read their lead and hides it from org B (404, no existence leak)', async () => {
      expect((await as('aSales', 'GET', `/leads/${fx.records.leadA1}`)).status).toBe(200);
      for (const who of ['bSales', 'bAdmin']) {
        const res = await as(who, 'GET', `/leads/${fx.records.leadA1}`);
        expect(res.status).toBe(404);
        expect(JSON.stringify(res.body)).not.toContain('Alpha');
      }
    });

    it('never lists another organization’s leads', async () => {
      const res = await as('bAdmin', 'GET', '/leads?limit=100');
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThan(0);
      expect(
        res.body.data.every((l: { full_name: string }) => l.full_name.startsWith('Beta')),
      ).toBe(true);
      expect(res.body.meta.pagination.total).toBe(res.body.data.length);
    });

    it('blocks cross-tenant updates and assignment', async () => {
      expect(
        (await as('bAdmin', 'PATCH', `/leads/${fx.records.leadA1}`, { notes: 'pwned' })).status,
      ).toBe(404);
      expect(
        (
          await as('bAdmin', 'PUT', `/leads/${fx.records.leadA1}/assignment`, {
            assigned_to: fx.users.bSales.id,
          })
        ).status,
      ).toBe(404);
      const row = (
        await db.pool.query('SELECT notes, assigned_to FROM leads WHERE id = $1', [
          fx.records.leadA1,
        ])
      ).rows[0];
      expect(row.notes).toBeNull();
      expect(row.assigned_to).toBe(fx.users.aSales.id);
    });

    it('takes the organization from the session, never from the body', async () => {
      const res = await as('bAdmin', 'POST', '/leads', {
        full_name: 'Injected Lead',
        mobile_number: '9123456780',
        organization_id: fx.orgA.id,
      });
      expect(res.status).toBe(201);
      const row = (
        await db.pool.query('SELECT organization_id FROM leads WHERE id = $1', [res.body.data.id])
      ).rows[0];
      expect(row.organization_id).toBe(fx.orgB.id);
    });

    it('rejects assigning records to members of another organization', async () => {
      const res = await as('aManager', 'POST', '/leads', {
        full_name: 'Cross Assign',
        mobile_number: '9123456781',
        assigned_to: fx.users.bSales.id,
      });
      expect(res.status).toBe(400);
      const assign = await as('aManager', 'PUT', `/leads/${fx.records.leadA1}/assignment`, {
        assigned_to: fx.users.bSales.id,
      });
      expect(assign.status).toBe(400);
    });

    it('applies record scope inside the organization (sales: own; manager/admin: organization)', async () => {
      const salesIds = ids(await as('aSales', 'GET', '/leads?limit=100'));
      expect(salesIds).toContain(fx.records.leadA1);
      expect(salesIds).not.toContain(fx.records.leadA3);
      expect((await as('aSales', 'GET', `/leads/${fx.records.leadA3}`)).status).toBe(403);
      expect(
        (await as('aSales', 'PATCH', `/leads/${fx.records.leadA3}`, { notes: 'x' })).status,
      ).toBe(403);

      const managerIds = ids(await as('aManager', 'GET', '/leads?limit=100'));
      expect(managerIds).toEqual(
        expect.arrayContaining([fx.records.leadA1, fx.records.leadA2, fx.records.leadA3]),
      );
      expect(managerIds).not.toContain(fx.records.leadB1);
    });

    it('lets sales only assign to themselves; assignment endpoint needs org-wide permission', async () => {
      const create = await as('aSales', 'POST', '/leads', {
        full_name: 'Sales Lead',
        mobile_number: '9123456782',
        assigned_to: fx.users.aSales2.id,
      });
      expect(create.status).toBe(403);
      const assign = await as('aSales', 'PUT', `/leads/${fx.records.leadA1}/assignment`, {
        assigned_to: fx.users.aSales.id,
      });
      expect(assign.status).toBe(403);
      expect(assign.body.error.message).toBe('You do not have permission to perform this action');
      expect(JSON.stringify(assign.body)).not.toMatch(/requiredRoles|userRole|roleId/);
    });
  });

  describe('customers', () => {
    it('isolates lists, updates and deletes', async () => {
      const list = await as('bAdmin', 'GET', '/customers');
      expect(list.status).toBe(200);
      expect(ids(list)).toEqual([fx.records.customerB]);
      expect(
        (
          await as('bAdmin', 'PATCH', `/customers/${fx.records.customerA}`, {
            name: 'x',
            email: 'x@y.test',
          })
        ).status,
      ).toBe(404);
      expect((await as('bAdmin', 'DELETE', `/customers/${fx.records.customerA}`)).status).toBe(404);
      expect(
        await count('SELECT count(*) FROM customers WHERE id = $1', [fx.records.customerA]),
      ).toBe(1);
    });

    it('scopes customer email uniqueness per organization', async () => {
      // shared@customer.test exists in both orgs (fixture); a duplicate within B is rejected.
      const dup = await as('bAdmin', 'POST', '/customers', {
        name: 'Dup',
        email: 'shared@customer.test',
      });
      expect(dup.status).toBe(409);
    });

    it('limits sales to their own customers', async () => {
      const aSales = await as('aSales', 'GET', '/customers');
      expect(
        aSales.body.data.every(
          (c: { assigned_to: number }) => c.assigned_to === fx.users.aSales.id,
        ),
      ).toBe(true);
    });
  });

  describe('opportunities', () => {
    it('isolates lists, updates, assignment and creation on foreign leads', async () => {
      expect(ids(await as('bSales', 'GET', '/opportunities'))).toEqual([fx.records.oppB]);
      expect(
        (await as('aAdmin', 'PATCH', `/opportunities/${fx.records.oppB}`, { title: 'x' })).status,
      ).toBe(404);
      expect(
        (
          await as('bAdmin', 'PUT', `/opportunities/${fx.records.oppA}/assignment`, {
            assigned_to: null,
          })
        ).status,
      ).toBe(404);
      const create = await as('aSales', 'POST', '/opportunities', {
        lead_id: fx.records.leadB1,
        title: 'steal',
      });
      expect(create.status).toBe(404);
    });
  });

  describe('tasks, calendar and follow-ups', () => {
    it('isolates tasks and calendar events', async () => {
      expect(ids(await as('bAdmin', 'GET', '/tasks'))).toEqual([fx.records.taskB]);
      expect(
        (await as('bAdmin', 'PATCH', `/tasks/${fx.records.taskA}`, { title: 'x' })).status,
      ).toBe(404);
      expect((await as('bAdmin', 'DELETE', `/tasks/${fx.records.taskA}`)).status).toBe(404);
      expect((await as('bAdmin', 'DELETE', `/calendar/events/${fx.records.taskA}`)).status).toBe(
        404,
      );
      expect(ids(await as('bAdmin', 'GET', '/calendar/events'))).toEqual([fx.records.taskB]);
      expect(await count('SELECT count(*) FROM tasks WHERE id = $1', [fx.records.taskA])).toBe(1);
    });

    it('limits sales to their own tasks', async () => {
      expect(ids(await as('aSales', 'GET', '/tasks'))).toEqual([fx.records.taskA]);
      expect(
        (await as('aSales', 'PATCH', `/tasks/${fx.records.taskA2}`, { title: 'x' })).status,
      ).toBe(403);
      expect((await as('aSales', 'DELETE', `/tasks/${fx.records.taskA}`)).status).toBe(403);
    });

    it('isolates follow-ups', async () => {
      expect(
        (await as('bAdmin', 'POST', `/followups/${fx.records.followupA}/complete`)).status,
      ).toBe(404);
      const list = await as('bAdmin', 'GET', '/followups');
      expect(list.status).toBe(200);
      expect(
        (list.body.data as { lead_id: number }[]).some((f) => f.lead_id === fx.records.leadA1),
      ).toBe(false);
      const followup = await as('bSales', 'POST', `/leads/${fx.records.leadA1}/followups`, {
        scheduled_at: new Date(Date.now() + 86_400_000).toISOString(),
      });
      expect(followup.status).toBe(404);
    });
  });

  describe('notes', () => {
    it('lists notes for sales users (regression: const reassignment used to throw)', async () => {
      const res = await as('aSales', 'GET', '/notes?search=note');
      expect(res.status).toBe(200);
      expect(ids(res)).toEqual([fx.records.noteA]);
      expect(res.body.meta.pagination.total).toBe(1);
    });

    it('isolates reads, updates and deletes', async () => {
      expect((await as('bAdmin', 'GET', `/notes/${fx.records.noteA}`)).status).toBe(404);
      expect(
        (await as('bAdmin', 'PATCH', `/notes/${fx.records.noteA}`, { title: 'x' })).status,
      ).toBe(404);
      expect((await as('bAdmin', 'DELETE', `/notes/${fx.records.noteA}`)).status).toBe(404);
      expect(ids(await as('bAdmin', 'GET', '/notes'))).toEqual([fx.records.noteB]);
      expect(
        await count('SELECT count(*) FROM notes WHERE id = $1 AND is_deleted = false', [
          fx.records.noteA,
        ]),
      ).toBe(1);
    });
  });

  describe('calls, messages and chat', () => {
    it('isolates call logs', async () => {
      expect(ids(await as('bAdmin', 'GET', '/calls'))).toEqual([fx.records.callB]);
      expect((await as('bAdmin', 'POST', `/calls/${fx.records.callA}/end`, {})).status).toBe(404);
      expect((await as('bSales', 'POST', '/calls', { lead_id: fx.records.leadA1 })).status).toBe(
        404,
      );
    });

    it('isolates lead messaging', async () => {
      const list = await as('bAdmin', 'GET', '/messages');
      expect(
        list.body.data.every((m: { lead_id: number }) => m.lead_id === fx.records.leadB1),
      ).toBe(true);
      expect(
        (
          await as('bAdmin', 'PATCH', `/messages/${fx.records.messageA}/status`, {
            status: 'Failed',
          })
        ).status,
      ).toBe(404);
      expect(
        (
          await as('bSales', 'POST', '/messages', {
            lead_id: fx.records.leadA1,
            channel: 'sms',
            content: 'x',
          })
        ).status,
      ).toBe(404);
      const bulk = await as('bAdmin', 'POST', '/messages/bulk', {
        lead_ids: [fx.records.leadB1, fx.records.leadA1],
        channel: 'sms',
        content: 'x',
      });
      expect(bulk.status).toBe(404);
      expect(
        await count("SELECT count(*) FROM messages WHERE lead_id = $1 AND status = 'Failed'", [
          fx.records.leadA1,
        ]),
      ).toBe(0);
    });

    it('sends messages within the organization (regression: lowercase channel violated the CHECK)', async () => {
      const res = await as('aSales', 'POST', '/messages', {
        lead_id: fx.records.leadA1,
        channel: 'whatsapp',
        content: 'hi',
      });
      expect(res.status).toBe(201);
      const row = (
        await db.pool.query('SELECT organization_id, message_type FROM messages WHERE id = $1', [
          res.body.data.id,
        ])
      ).rows[0];
      expect(row).toEqual({ organization_id: fx.orgA.id, message_type: 'WhatsApp' });
    });

    it('isolates chat conversations and participants', async () => {
      const conv = `/chat/conversations/${fx.records.convA}`;
      expect((await as('bAdmin', 'GET', `${conv}/messages`)).status).toBe(404);
      expect((await as('bAdmin', 'GET', `${conv}/participants`)).status).toBe(404);
      expect((await as('bAdmin', 'POST', `${conv}/messages`, { content: 'x' })).status).toBe(404);
      const create = await as('bAdmin', 'POST', '/chat/conversations', {
        is_group: true,
        name: 'x',
        participant_ids: [fx.users.aSales.id],
      });
      expect(create.status).toBe(400);
      expect(ids(await as('aSales', 'GET', '/chat/conversations'))).toEqual([fx.records.convA]);
    });
  });

  describe('reports', () => {
    const leadsIn = (orgId: number) =>
      count('SELECT count(*) FROM leads WHERE organization_id = $1', [orgId]);
    const sum = (values: Record<string, number>) =>
      Object.values(values).reduce((total, n) => total + n, 0);

    it('aggregates only the caller’s organization', async () => {
      const b = await as('bAdmin', 'GET', '/reports/dashboard-summary');
      expect(b.status).toBe(200);
      expect(b.body.data.totalLeads).toBe(await leadsIn(fx.orgB.id));

      const a = await as('aManager', 'GET', '/reports/dashboard-summary');
      expect(a.body.data.totalLeads).toBe(await leadsIn(fx.orgA.id));

      const conversion = await as('bAdmin', 'GET', '/reports/conversion?days=30');
      expect(sum(conversion.body.data)).toBe(await leadsIn(fx.orgB.id));

      const aging = await as('bAdmin', 'GET', '/reports/lead-aging');
      expect(sum(aging.body.data)).toBe(await leadsIn(fx.orgB.id));
    });

    it('limits sales reports to own records and blocks per-member reports', async () => {
      const summary = await as('aSales', 'GET', '/reports/dashboard-summary');
      expect(summary.body.data.totalLeads).toBe(
        await count('SELECT count(*) FROM leads WHERE organization_id = $1 AND assigned_to = $2', [
          fx.orgA.id,
          fx.users.aSales.id,
        ]),
      );
      expect((await as('aSales', 'GET', '/reports/sales-performance')).status).toBe(403);
    });

    it('reports sales performance only for members of the organization', async () => {
      const res = await as('bAdmin', 'GET', '/reports/sales-performance');
      const emails = res.body.data.map((row: { email: string }) => row.email);
      expect(emails).toContain(fx.users.bSales.email);
      expect(emails.some((email: string) => email.startsWith('a_'))).toBe(false);
    });

    it('exports only the organization’s leads and rejects SQL in parameters', async () => {
      const csv = await as('bAdmin', 'GET', '/reports/leads-export');
      expect(csv.status).toBe(200);
      expect(csv.body).toContain('Beta Lead One');
      expect(csv.body).not.toContain('Alpha');
      expect(csv.body.split('\n').length).toBeGreaterThan(2);

      const injection = await as(
        'bAdmin',
        'GET',
        `/reports/conversion?days=${encodeURIComponent("1 days' OR '1'='1")}`,
      );
      expect(injection.status).toBe(400);
    });
  });

  describe('members, settings, audit and locations', () => {
    it('lists only members of the organization and hides foreign users', async () => {
      const res = await as('bAdmin', 'GET', '/organization/members?limit=100');
      const emails = res.body.data.map((u: { email: string }) => u.email);
      expect(emails).toEqual(
        expect.arrayContaining([
          fx.users.bAdmin.email,
          fx.users.bSales.email,
          fx.users.multi.email,
        ]),
      );
      expect(emails.some((email: string) => email.startsWith('a_'))).toBe(false);
      expect(
        (
          await as('bAdmin', 'PUT', `/organization/members/${fx.users.aSales.id}/profile`, {
            full_name: 'x',
            email: 'x@y.test',
            username: 'x',
          })
        ).status,
      ).toBe(404);
      expect(
        (
          await as('bAdmin', 'PATCH', `/organization/members/${fx.users.aSales.id}`, {
            status: 'suspended',
          })
        ).status,
      ).toBe(404);
    });

    it('keeps settings per organization', async () => {
      const b = await as('bAdmin', 'GET', '/settings');
      expect(b.body.data.site_name).toBe('Beta Settings');
      await as('bAdmin', 'PATCH', '/settings', { settings: { site_name: 'Beta Renamed' } });
      const a = await as('aAdmin', 'GET', '/settings');
      expect(a.body.data.site_name).toBe('Alpha Settings');
    });

    it('shows each organization only its own audit log', async () => {
      const b = await as('bAdmin', 'GET', '/audit-logs?limit=100');
      expect(b.status).toBe(200);
      const rows = b.body.data as { table_name: string }[];
      expect(rows.some((row) => row.table_name === 'Beta Settings')).toBe(true);
      expect(rows.some((row) => row.table_name === 'Alpha Settings')).toBe(false);
      expect(
        await count('SELECT count(*) FROM audit_logs WHERE organization_id = $1', [fx.orgB.id]),
      ).toBe(b.body.meta.pagination.total);
    });

    it('stamps new audit events with organization, actor and request id', async () => {
      const res = await as('aManager', 'POST', '/leads', {
        full_name: 'Audited Lead',
        mobile_number: '9123456783',
      });
      expect(res.status).toBe(201);
      const row = (
        await db.pool.query(
          `SELECT organization_id, user_id, request_id FROM audit_logs WHERE action = 'CREATE_LEAD' AND record_id = $1`,
          [res.body.data.id],
        )
      ).rows[0];
      expect(row.organization_id).toBe(fx.orgA.id);
      expect(row.user_id).toBe(fx.users.aManager.id);
      expect(row.request_id).toBe(res.headers.get('x-request-id'));
    });

    it('isolates sales locations', async () => {
      expect(
        (await as('bAdmin', 'PATCH', `/locations/${fx.records.locationA}`, { name: 'x' })).status,
      ).toBe(404);
      expect((await as('bAdmin', 'DELETE', `/locations/${fx.records.locationA}`)).status).toBe(404);
      expect(ids(await as('bAdmin', 'GET', '/locations'))).toEqual([fx.records.locationB]);
    });
  });

  describe('permission differences (server-enforced)', () => {
    it('answers 403 without leaking role details', async () => {
      for (const [who, path] of [
        ['aSales', '/organization/members'],
        ['aSales', '/audit-logs'],
        ['aManager', '/settings'],
        ['aManager', '/audit-logs'],
        ['aSales', '/locations'],
      ] as const) {
        const res = await as(who, 'GET', path);
        expect(res.status).toBe(403);
        expect(JSON.stringify(res.body)).not.toMatch(/requiredRoles|userRole|roleId|role_id/);
      }
      expect((await as('aManager', 'DELETE', `/customers/${fx.records.customerA}`)).status).toBe(
        403,
      );
      expect(
        (
          await as('aManager', 'POST', '/organization/members', {
            full_name: 'x',
            email: 'n@x.test',
            password: 'Passw0rd123',
            roleKey: 'sales',
          })
        ).status,
      ).toBe(403);
    });

    it('answers 401 without a token and for pre-Phase-2 tokens', async () => {
      expect((await call(base, 'GET', '/api/v1/leads')).status).toBe(401);
      const jwt = await import('jsonwebtoken');
      const legacy = jwt.default.sign(
        { userId: fx.users.aAdmin.id, roleId: 1 },
        process.env.JWT_SECRET!,
        { expiresIn: '24h' },
      );
      expect((await call(base, 'GET', '/api/v1/leads', { token: legacy })).status).toBe(401);
    });
  });
});
