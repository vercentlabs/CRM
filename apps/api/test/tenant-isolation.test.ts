import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestSchema, hasTestDatabase, type TestSchema } from './helpers/db.js';
import { seedTenants, type TenantFixture } from './helpers/fixtures.js';
import { call, loginMobile, startApp, type TestServer } from './helpers/http.js';

/**
 * Organization A must never read, change, delete, report on or message
 * Organization B's data (and vice versa) through any API, including legacy
 * routes. Foreign-tenant ids answer 404 so existence is never revealed.
 */
describe.skipIf(!hasTestDatabase)('tenant isolation (real HTTP + PostgreSQL)', () => {
  let db: TestSchema;
  let server: TestServer;
  let fx: TenantFixture;
  const token: Record<string, string> = {};
  let base: string;

  const as = (who: string, method: string, path: string, body?: unknown) =>
    call(base, method, path, { token: token[who]!, ...(body === undefined ? {} : { body }) });

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
      expect(res.body.leads.length).toBeGreaterThan(0);
      expect(res.body.leads.every((l: { name: string }) => l.name.startsWith('Beta'))).toBe(true);
      expect(res.body.pagination.totalItems).toBe(res.body.leads.length);
    });

    it('blocks cross-tenant updates and assignment', async () => {
      expect(
        (await as('bAdmin', 'PUT', `/leads/${fx.records.leadA1}`, { notes: 'pwned' })).status,
      ).toBe(404);
      expect(
        (
          await as('bAdmin', 'PATCH', `/leads/${fx.records.leadA1}/assign`, {
            assigned_to: fx.users.bSales.id,
          })
        ).status,
      ).toBe(404);
      const notes = (
        await db.pool.query('SELECT notes, assigned_to FROM leads WHERE id = $1', [
          fx.records.leadA1,
        ])
      ).rows[0];
      expect(notes.notes).toBeNull();
      expect(notes.assigned_to).toBe(fx.users.aSales.id);
    });

    it('takes the organization from the session, never from the body', async () => {
      const res = await as('bAdmin', 'POST', '/leads', {
        full_name: 'Injected Lead',
        mobile_number: '9123456780',
        organization_id: fx.orgA.id,
      });
      expect(res.status).toBe(201);
      const row = (
        await db.pool.query('SELECT organization_id FROM leads WHERE id = $1', [res.body.lead.id])
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
      const assign = await as('aManager', 'PATCH', `/leads/${fx.records.leadA1}/assign`, {
        assigned_to: fx.users.bSales.id,
      });
      expect(assign.status).toBe(400);
    });

    it('applies record scope inside the organization (sales: own; manager/admin: organization)', async () => {
      const sales = await as('aSales', 'GET', '/leads?limit=100');
      const ids = sales.body.leads.map((l: { id: number }) => l.id);
      expect(ids).toContain(fx.records.leadA1);
      expect(ids).not.toContain(fx.records.leadA3);
      expect((await as('aSales', 'GET', `/leads/${fx.records.leadA3}`)).status).toBe(403);
      expect(
        (await as('aSales', 'PUT', `/leads/${fx.records.leadA3}`, { notes: 'x' })).status,
      ).toBe(403);

      const manager = await as('aManager', 'GET', '/leads?limit=100');
      const managerIds = manager.body.leads.map((l: { id: number }) => l.id);
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
      const assign = await as('aSales', 'PATCH', `/leads/${fx.records.leadA1}/assign`, {
        assigned_to: fx.users.aSales.id,
      });
      expect(assign.status).toBe(403);
      expect(assign.body.message).toBe('You do not have permission to perform this action');
      expect(JSON.stringify(assign.body)).not.toMatch(/requiredRoles|userRole|roleId/);
    });
  });

  describe('customers', () => {
    it('isolates lists, updates and deletes', async () => {
      const list = await as('bAdmin', 'GET', '/customers');
      expect(list.status).toBe(200);
      expect(list.body.data.customers.map((c: { id: number }) => c.id)).toEqual([
        fx.records.customerB,
      ]);

      expect(
        (
          await as('bAdmin', 'PUT', `/customers/${fx.records.customerA}`, {
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
        aSales.body.data.customers.every(
          (c: { assigned_to: number }) => c.assigned_to === fx.users.aSales.id,
        ),
      ).toBe(true);
    });
  });

  describe('opportunities', () => {
    it('isolates lists, updates, assignment and creation on foreign leads', async () => {
      const list = await as('bSales', 'GET', '/opportunities');
      expect(list.body.opportunities.map((o: { id: number }) => o.id)).toEqual([fx.records.oppB]);
      expect(
        (await as('aAdmin', 'PUT', `/opportunities/${fx.records.oppB}`, { title: 'x' })).status,
      ).toBe(404);
      expect(
        (
          await as('bAdmin', 'PATCH', `/opportunities/${fx.records.oppA}/assign`, {
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
      const tasks = await as('bAdmin', 'GET', '/tasks');
      expect(tasks.body.tasks.map((t: { id: number }) => t.id)).toEqual([fx.records.taskB]);
      expect(
        (await as('bAdmin', 'PATCH', `/tasks/${fx.records.taskA}`, { title: 'x' })).status,
      ).toBe(404);
      expect((await as('bAdmin', 'DELETE', `/tasks/${fx.records.taskA}`)).status).toBe(404);
      expect((await as('bAdmin', 'DELETE', `/calendar/${fx.records.taskA}`)).status).toBe(404);
      const events = await as('bAdmin', 'GET', '/calendar');
      expect(events.body.events.map((e: { id: number }) => e.id)).toEqual([fx.records.taskB]);
      expect(await count('SELECT count(*) FROM tasks WHERE id = $1', [fx.records.taskA])).toBe(1);
    });

    it('limits sales to their own tasks', async () => {
      const tasks = await as('aSales', 'GET', '/tasks');
      expect(tasks.body.tasks.map((t: { id: number }) => t.id)).toEqual([fx.records.taskA]);
      expect(
        (await as('aSales', 'PATCH', `/tasks/${fx.records.taskA2}`, { title: 'x' })).status,
      ).toBe(403);
      expect((await as('aSales', 'DELETE', `/tasks/${fx.records.taskA}`)).status).toBe(403);
    });

    it('isolates follow-ups', async () => {
      expect(
        (await as('bAdmin', 'PATCH', `/followups/${fx.records.followupA}/complete`)).status,
      ).toBe(404);
      const list = await as('bAdmin', 'GET', '/followups');
      expect(list.status).toBe(200);
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
      expect(res.body.notes.map((n: { id: number }) => n.id)).toEqual([fx.records.noteA]);
      expect(res.body.total).toBe(1);
    });

    it('isolates reads, updates and deletes', async () => {
      expect((await as('bAdmin', 'GET', `/notes/${fx.records.noteA}`)).status).toBe(404);
      expect((await as('bAdmin', 'PUT', `/notes/${fx.records.noteA}`, { title: 'x' })).status).toBe(
        404,
      );
      expect((await as('bAdmin', 'DELETE', `/notes/${fx.records.noteA}`)).status).toBe(404);
      const all = await as('bAdmin', 'GET', '/notes');
      expect(all.body.notes.map((n: { id: number }) => n.id)).toEqual([fx.records.noteB]);
      expect(
        await count('SELECT count(*) FROM notes WHERE id = $1 AND is_deleted = false', [
          fx.records.noteA,
        ]),
      ).toBe(1);
    });
  });

  describe('calls, messages and chat', () => {
    it('isolates call logs', async () => {
      const calls = await as('bAdmin', 'GET', '/calls');
      expect(calls.body.calls.map((c: { id: number }) => c.id)).toEqual([fx.records.callB]);
      expect((await as('bAdmin', 'PUT', `/calls/${fx.records.callA}/end`, {})).status).toBe(404);
      expect(
        (await as('bSales', 'POST', '/calls/initiate', { leadId: fx.records.leadA1 })).status,
      ).toBe(404);
    });

    it('isolates lead messaging on both legacy prefixes', async () => {
      for (const prefix of ['/messages', '/api/lead-messages']) {
        const list = await as('bAdmin', 'GET', prefix);
        expect(
          list.body.messages.every((m: { lead_id: number }) => m.lead_id === fx.records.leadB1),
        ).toBe(true);
        expect(
          (
            await as('bAdmin', 'PUT', `${prefix}/${fx.records.messageA}/status`, {
              status: 'Failed',
            })
          ).status,
        ).toBe(404);
        expect(
          (
            await as('bSales', 'POST', `${prefix}/send`, {
              leadId: fx.records.leadA1,
              channel: 'sms',
              content: 'x',
            })
          ).status,
        ).toBe(404);
        const bulk = await as('bAdmin', 'POST', `${prefix}/bulk`, {
          leadIds: [fx.records.leadB1, fx.records.leadA1],
          channel: 'sms',
          content: 'x',
        });
        expect(bulk.status).toBe(404);
      }
      expect(
        await count("SELECT count(*) FROM messages WHERE lead_id = $1 AND status = 'Failed'", [
          fx.records.leadA1,
        ]),
      ).toBe(0);
    });

    it('sends messages within the organization (regression: lowercase channel violated the CHECK)', async () => {
      const res = await as('aSales', 'POST', '/messages/send', {
        leadId: fx.records.leadA1,
        channel: 'whatsapp',
        content: 'hi',
      });
      expect(res.status).toBe(201);
      const row = (
        await db.pool.query('SELECT organization_id, message_type FROM messages WHERE id = $1', [
          res.body.messageId,
        ])
      ).rows[0];
      expect(row).toEqual({ organization_id: fx.orgA.id, message_type: 'WhatsApp' });
    });

    it('isolates chat conversations and participants', async () => {
      expect(
        (await as('bAdmin', 'GET', `/api/chat/conversations/${fx.records.convA}/messages`)).status,
      ).toBe(404);
      expect(
        (
          await as('bAdmin', 'POST', `/api/chat/conversations/${fx.records.convA}/messages`, {
            content: 'x',
          })
        ).status,
      ).toBe(404);
      const create = await as('bAdmin', 'POST', '/api/chat/conversations', {
        isGroup: true,
        name: 'x',
        participantIds: [fx.users.aSales.id],
      });
      expect(create.status).toBe(400);
      const list = await as('aSales', 'GET', '/api/chat/conversations');
      expect(list.body.conversations.map((c: { id: number }) => c.id)).toEqual([fx.records.convA]);
    });
  });

  describe('reports', () => {
    const leadsIn = (orgId: number) =>
      count('SELECT count(*) FROM leads WHERE organization_id = $1', [orgId]);

    it('aggregates only the caller’s organization', async () => {
      const b = await as('bAdmin', 'GET', '/reports/dashboard-summary');
      expect(b.status).toBe(200);
      expect(b.body.totalLeads).toBe(await leadsIn(fx.orgB.id));

      const a = await as('aManager', 'GET', '/reports/dashboard-summary');
      expect(a.body.totalLeads).toBe(await leadsIn(fx.orgA.id));

      const conversion = await as('bAdmin', 'GET', '/reports/conversion-report?days=30');
      const total = Object.values(conversion.body as Record<string, number>).reduce(
        (sum, n) => sum + n,
        0,
      );
      expect(total).toBe(await leadsIn(fx.orgB.id));

      const aging = await as('bAdmin', 'GET', '/reports/lead-aging');
      const agingTotal = Object.values(aging.body as Record<string, number>).reduce(
        (sum, n) => sum + n,
        0,
      );
      expect(agingTotal).toBe(await leadsIn(fx.orgB.id));
    });

    it('limits sales reports to own records and blocks per-member reports', async () => {
      const summary = await as('aSales', 'GET', '/reports/dashboard-summary');
      expect(summary.body.totalLeads).toBe(
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
      const csv = await as('bAdmin', 'GET', '/reports/export-leads-csv');
      expect(csv.status).toBe(200);
      expect(csv.body).toContain('Beta Lead One');
      expect(csv.body).not.toContain('Alpha');
      expect(csv.body.split('\n').length).toBeGreaterThan(2);

      const injection = await as(
        'bAdmin',
        'GET',
        `/reports/conversion-report?days=${encodeURIComponent("1 days' OR '1'='1")}`,
      );
      expect(injection.status).toBe(400);
    });
  });

  describe('users, settings, audit and locations', () => {
    it('lists only members of the organization and hides foreign users', async () => {
      const res = await as('bAdmin', 'GET', '/users');
      const emails = res.body.users.map((u: { email: string }) => u.email);
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
          await as('bAdmin', 'PUT', `/users/${fx.users.aSales.id}`, {
            full_name: 'x',
            email: 'x@y.test',
            username: 'x',
            role_id: 3,
          })
        ).status,
      ).toBe(404);
      expect((await as('bAdmin', 'PATCH', `/users/${fx.users.aSales.id}/status`)).status).toBe(404);
    });

    it('keeps settings per organization', async () => {
      const b = await as('bAdmin', 'GET', '/settings');
      expect(b.body.data.settings.site_name).toBe('Beta Settings');
      await as('bAdmin', 'PATCH', '/settings', { settings: { site_name: 'Beta Renamed' } });
      const a = await as('aAdmin', 'GET', '/settings');
      expect(a.body.data.settings.site_name).toBe('Alpha Settings');
    });

    it('shows each organization only its own audit log', async () => {
      const b = await as('bAdmin', 'GET', '/audit?limit=100');
      expect(b.status).toBe(200);
      const rows = b.body.audit_logs as { table_name: string; action: string }[];
      expect(rows.some((row) => row.table_name === 'Beta Settings')).toBe(true);
      expect(rows.some((row) => row.table_name === 'Alpha Settings')).toBe(false);
      expect(
        await count('SELECT count(*) FROM audit_logs WHERE organization_id = $1', [fx.orgB.id]),
      ).toBe(b.body.pagination.totalItems);
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
          [res.body.lead.id],
        )
      ).rows[0];
      expect(row.organization_id).toBe(fx.orgA.id);
      expect(row.user_id).toBe(fx.users.aManager.id);
      expect(row.request_id).toBe(res.headers.get('x-request-id'));
    });

    it('isolates sales locations', async () => {
      expect(
        (await as('bAdmin', 'PUT', `/sales-locations/${fx.records.locationA}`, { name: 'x' }))
          .status,
      ).toBe(404);
      expect(
        (await as('bAdmin', 'DELETE', `/sales-locations/${fx.records.locationA}`)).status,
      ).toBe(404);
      const list = await as('bAdmin', 'GET', '/sales-locations');
      expect(list.body.locations.map((l: { id: number }) => l.id)).toEqual([fx.records.locationB]);
    });
  });

  describe('permission differences (server-enforced)', () => {
    it('answers 403 without leaking role details', async () => {
      for (const [who, path] of [
        ['aSales', '/users'],
        ['aSales', '/audit'],
        ['aManager', '/settings'],
        ['aManager', '/audit'],
        ['aSales', '/sales-locations'],
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
          await as('aManager', 'POST', '/users', {
            full_name: 'x',
            email: 'n@x.test',
            password: 'Passw0rd123',
            roleId: 3,
          })
        ).status,
      ).toBe(403);
    });

    it('answers 401 without a token and for pre-Phase-2 tokens', async () => {
      expect((await call(base, 'GET', '/leads')).status).toBe(401);
      const jwt = await import('jsonwebtoken');
      const legacy = jwt.default.sign(
        { userId: fx.users.aAdmin.id, roleId: 1 },
        process.env.JWT_SECRET!,
        { expiresIn: '24h' },
      );
      expect((await call(base, 'GET', '/leads', { token: legacy })).status).toBe(401);
    });
  });
});
