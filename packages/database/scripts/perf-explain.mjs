#!/usr/bin/env node
/**
 * Query performance review on seeded data (Phase 7).
 *
 *   PERF_DATABASE_URL=postgresql://…/crm_perf node packages/database/scripts/perf-explain.mjs [--seed]
 *
 * Migrates a DISPOSABLE database (its name must contain "perf"), optionally
 * seeds production-like volumes with generate_series (one large and one small
 * organization), then runs EXPLAIN (ANALYZE, BUFFERS) on the hot queries of the
 * API, worker and maintenance scans, copied from the repositories. Prints a
 * Markdown table: execution time, whether a large table was sequentially
 * scanned, and the top plan node. Never run against a real database.
 */
import { createPool, migrate, MIGRATIONS_DIR } from '../dist/index.js';

const url = process.env.PERF_DATABASE_URL;
if (!url || !/perf/i.test(new URL(url).pathname)) {
  console.error(
    'PERF_DATABASE_URL must point to a disposable database whose name contains "perf".',
  );
  process.exit(2);
}

const SCALE = Number(process.env.PERF_SCALE ?? 1);
const n = (value) => Math.round(value * SCALE);

const pool = createPool({ connectionString: url, max: 2, applicationName: 'crm-perf-explain' });

async function seed() {
  const q = (sql, params = []) => pool.query(sql, params);
  const started = Date.now();
  await q(`INSERT INTO organizations (name, slug) VALUES ('Perf Large', 'perf-large'), ('Perf Small', 'perf-small')
           ON CONFLICT DO NOTHING`);
  const [big, small] = (
    await q(`SELECT id FROM organizations WHERE slug IN ('perf-large','perf-small') ORDER BY slug`)
  ).rows.map((r) => r.id);
  await q(`INSERT INTO users (username, email, password_hash, full_name, is_active)
           SELECT 'perf_u' || g, 'perf_u' || g || '@example.test', 'x', 'Perf User ' || g, true
           FROM generate_series(1, 60) g ON CONFLICT DO NOTHING`);
  const users = (
    await q(`SELECT id FROM users WHERE username LIKE 'perf_u%' ORDER BY id`)
  ).rows.map((r) => r.id);
  await q(
    `INSERT INTO organization_memberships (organization_id, user_id, role_id, status, joined_at)
           SELECT CASE WHEN i <= 50 THEN $1::int ELSE $2::int END, u, CASE WHEN i % 10 = 1 THEN 1 ELSE 3 END, 'active', now()
           FROM unnest($3::int[]) WITH ORDINALITY AS t(u, i) ON CONFLICT DO NOTHING`,
    [big, small, users],
  );
  const bigUsers = users.slice(0, 50);

  await q(
    `INSERT INTO leads (organization_id, full_name, mobile_number, email, status, assigned_to, created_by,
                              created_at, next_call_at)
           SELECT CASE WHEN g % 20 = 0 THEN $2::int ELSE $1::int END,
                  'Lead ' || g, lpad((9000000000 + g)::text, 10, '0'), 'lead' || g || '@example.test',
                  (ARRAY['New','Contacted','Qualified','Converted','Lost'])[1 + g % 5],
                  ($3::int[])[1 + g % 50], ($3::int[])[1 + g % 50],
                  now() - (g % 700) * interval '1 day',
                  CASE WHEN g % 50 = 0 THEN now() + (g % 90 - 45) * interval '1 minute' END
           FROM generate_series(1, $4::int) g`,
    [big, small, bigUsers, n(200_000)],
  );
  await q(
    `INSERT INTO tasks (organization_id, title, due_date, assigned_to, created_by, status)
           SELECT $1, 'Task ' || g, now() + (g % 400 - 200) * interval '1 hour', ($2::int[])[1 + g % 50],
                  ($2::int[])[1 + g % 50], (ARRAY['pending','in_progress','completed'])[1 + g % 3]
           FROM generate_series(1, $3::int) g`,
    [big, bigUsers, n(100_000)],
  );
  await q(
    `INSERT INTO notifications (organization_id, user_id, type, title, dedupe_key, read_at, created_at)
           SELECT $1, ($2::int[])[1 + g % 50], 'task.assigned', 'N ' || g, 'perf.' || g,
                  CASE WHEN g % 3 <> 0 THEN now() - (g % 400) * interval '1 day' END,
                  now() - (g % 400) * interval '1 day'
           FROM generate_series(1, $3::int) g ON CONFLICT DO NOTHING`,
    [big, bigUsers, n(500_000)],
  );
  await q(
    `INSERT INTO messages (organization_id, lead_id, user_id, message_type, content, status, queued_at, created_at)
           SELECT $1, l.id, l.assigned_to, 'SMS', 'Hello', (ARRAY['Sent','Delivered','Failed','Sent'])[1 + l.id % 4],
                  now() - (l.id % 300) * interval '1 day', now() - (l.id % 300) * interval '1 day'
           FROM leads l WHERE l.organization_id = $1 AND l.id % 1 = 0 LIMIT $2`,
    [big, n(200_000)],
  );
  await q(
    `INSERT INTO auth_sessions (user_id, organization_id, client, expires_at, revoked_at, created_at)
           SELECT ($2::int[])[1 + g % 50], $1, 'web', now() + (g % 90 - 60) * interval '1 day',
                  CASE WHEN g % 4 = 0 THEN now() - (g % 60) * interval '1 day' END, now() - (g % 90) * interval '1 day'
           FROM generate_series(1, $3::int) g`,
    [big, bigUsers, n(100_000)],
  );
  await q(
    `INSERT INTO audit_logs (organization_id, user_id, action, table_name, created_at)
           SELECT $1, ($2::int[])[1 + g % 50], 'UPDATE', 'leads', now() - (g % 365) * interval '1 day'
           FROM generate_series(1, $3::int) g`,
    [big, bigUsers, n(200_000)],
  );
  await q(
    `INSERT INTO webhook_endpoints (organization_id, url, event_types, secret_ciphertext)
           SELECT $1, 'https://hooks.example.com/' || g, ARRAY['lead.created'], 'v1.x.y.z' FROM generate_series(1, 5) g`,
    [big],
  );
  await q(
    `INSERT INTO webhook_deliveries (organization_id, endpoint_id, event_id, event_type, status, created_at, updated_at)
           SELECT $1, e.id, gen_random_uuid(), 'lead.created', (ARRAY['delivered','failed','delivered'])[1 + g % 3],
                  now() - (g % 200) * interval '1 day', now() - (g % 200) * interval '1 day'
           FROM webhook_endpoints e CROSS JOIN generate_series(1, $2::int) g WHERE e.organization_id = $1`,
    [big, n(40_000)],
  );
  const conv = await q(
    `INSERT INTO chat_conversations (organization_id, name, is_group, created_by)
                        SELECT $1, 'C' || g, true, $2 FROM generate_series(1, 100) g RETURNING id`,
    [big, bigUsers[0]],
  );
  await q(
    `INSERT INTO chat_participants (conversation_id, user_id)
           SELECT c, u FROM unnest($1::int[]) c CROSS JOIN unnest($2::int[]) u`,
    [conv.rows.map((r) => r.id), bigUsers.slice(0, 10)],
  );
  await q(
    `INSERT INTO chat_messages (conversation_id, sender_id, content, message_type, created_at)
           SELECT ($1::int[])[1 + g % 100], ($2::int[])[1 + g % 10], 'm' || g, 'text', now() - (g % 1000) * interval '1 hour'
           FROM generate_series(1, $3::int) g`,
    [conv.rows.map((r) => r.id), bigUsers.slice(0, 10), n(100_000)],
  );
  await q('ANALYZE');
  console.error(`Seeded in ${Math.round((Date.now() - started) / 1000)}s (scale ${SCALE}).`);
  return { big, user: bigUsers[1], conversation: conv.rows[0].id, endpoint: null };
}

async function context() {
  const big = (await pool.query(`SELECT id FROM organizations WHERE slug = 'perf-large'`)).rows[0]
    ?.id;
  if (!big) throw new Error('No seeded data: run with --seed first.');
  const user = (
    await pool.query(
      `SELECT user_id FROM organization_memberships WHERE organization_id = $1 AND role_id = 3 LIMIT 1`,
      [big],
    )
  ).rows[0].user_id;
  const conversation = (
    await pool.query(`SELECT id FROM chat_conversations WHERE organization_id = $1 LIMIT 1`, [big])
  ).rows[0].id;
  return { big, user, conversation };
}

const SELECT_LEAD = `SELECT l.id, l.full_name, l.status, l.next_call_at, l.created_at, u.full_name AS assigned_user_name,
  loc.name AS location_name FROM leads l LEFT JOIN users u ON u.id = l.assigned_to
  LEFT JOIN sales_locations loc ON loc.id = l.location_id AND loc.organization_id = l.organization_id`;

const queries = (c) => [
  [
    'leads: org list, newest first (admin)',
    `${SELECT_LEAD} WHERE l.organization_id = $1 ORDER BY l.created_at DESC, l.id DESC LIMIT 20 OFFSET 0`,
    [c.big],
  ],
  [
    'leads: count for pagination',
    `SELECT COUNT(*) FROM leads l WHERE l.organization_id = $1`,
    [c.big],
  ],
  [
    'leads: own scope (sales)',
    `${SELECT_LEAD} WHERE l.organization_id = $1 AND (l.assigned_to = $2 OR (l.assigned_to IS NULL AND l.created_by = $2)) ORDER BY l.created_at DESC, l.id DESC LIMIT 20`,
    [c.big, c.user],
  ],
  [
    'leads: status filter + page 50',
    `${SELECT_LEAD} WHERE l.organization_id = $1 AND l.status = 'Qualified' ORDER BY l.created_at DESC, l.id DESC LIMIT 20 OFFSET 1000`,
    [c.big],
  ],
  [
    'leads: search',
    `${SELECT_LEAD} WHERE l.organization_id = $1 AND (l.full_name ILIKE $2 OR l.email ILIKE $2 OR l.mobile_number ILIKE $2) ORDER BY l.created_at DESC LIMIT 20`,
    [c.big, '%lead1234%'],
  ],
  [
    'tasks: org list by due date',
    `SELECT id, title, due_date FROM tasks WHERE organization_id = $1 ORDER BY due_date LIMIT 20`,
    [c.big],
  ],
  [
    'notifications: my recent',
    `SELECT id, title, read_at FROM notifications WHERE organization_id = $1 AND user_id = $2 ORDER BY created_at DESC LIMIT 20`,
    [c.big, c.user],
  ],
  [
    'notifications: unread count',
    `SELECT count(*) FROM notifications WHERE organization_id = $1 AND user_id = $2 AND read_at IS NULL`,
    [c.big, c.user],
  ],
  [
    'audit log: org page',
    `SELECT id, action, created_at FROM audit_logs WHERE organization_id = $1 ORDER BY created_at DESC LIMIT 50`,
    [c.big],
  ],
  [
    'chat: conversation messages',
    `SELECT cm.id, cm.content, f.public_id FROM chat_messages cm JOIN chat_conversations c ON c.id = cm.conversation_id AND c.organization_id = $2 JOIN users u ON u.id = cm.sender_id LEFT JOIN files f ON f.organization_id = c.organization_id AND f.entity_type = 'chat_message' AND f.entity_id = cm.id AND f.status = 'attached' WHERE cm.conversation_id = $1 ORDER BY cm.created_at ASC, cm.id ASC`,
    [c.conversation, c.big],
  ],
  [
    'webhooks: list with last delivery',
    `SELECT e.id, d.status FROM webhook_endpoints e LEFT JOIN LATERAL (SELECT status, updated_at FROM webhook_deliveries WHERE endpoint_id = e.id AND organization_id = e.organization_id ORDER BY created_at DESC LIMIT 1) d ON true WHERE e.organization_id = $1`,
    [c.big],
  ],
  [
    'reminders: follow-ups due (all orgs)',
    `SELECT l.id FROM leads l WHERE l.next_call_at IS NOT NULL AND l.assigned_to IS NOT NULL AND l.next_call_at > now() AND l.next_call_at <= now() + make_interval(mins => 15)`,
    [],
  ],
  [
    'reminders: tasks due (all orgs)',
    `SELECT t.id FROM tasks t WHERE t.assigned_to IS NOT NULL AND t.status IN ('pending','in_progress') AND t.due_date > now() AND t.due_date <= now() + make_interval(mins => 15)`,
    [],
  ],
  [
    'maintenance: stale Sending messages',
    `SELECT id FROM messages WHERE status = 'Sending' AND (sending_started_at IS NULL OR sending_started_at < now() - make_interval(secs => 60))`,
    [],
  ],
  [
    'retention: expired/revoked sessions',
    `SELECT id FROM auth_sessions WHERE (revoked_at IS NOT NULL AND revoked_at < now() - make_interval(days => 30)) OR expires_at < now() - make_interval(days => 30) LIMIT 5000`,
    [],
  ],
  [
    'retention: read notifications',
    `SELECT id FROM notifications WHERE read_at IS NOT NULL AND read_at < now() - make_interval(days => 90) LIMIT 5000`,
    [],
  ],
  [
    'retention: webhook deliveries',
    `SELECT id FROM webhook_deliveries WHERE status IN ('delivered','failed','cancelled') AND updated_at < now() - make_interval(days => 30) LIMIT 5000`,
    [],
  ],
  [
    'session: auth subject',
    `SELECT o.id, (SELECT st.value FROM settings st WHERE st.organization_id = o.id AND st.key = 'timezone') FROM organizations o WHERE o.id = $1`,
    [c.big],
  ],
];

const walk = (node, visit) => {
  visit(node);
  for (const child of node.Plans ?? []) walk(child, visit);
};

async function main() {
  await migrate({ pool, dir: MIGRATIONS_DIR });
  const c = process.argv.includes('--seed') ? await seed().then(context) : await context();
  const rows = [];
  for (const [name, sql, params] of queries(c)) {
    const result = await pool.query(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${sql}`, params);
    const plan = result.rows[0]['QUERY PLAN'][0];
    const seqScans = [];
    walk(plan.Plan, (node) => {
      if (
        node['Node Type'] === 'Seq Scan' &&
        node['Actual Rows'] + (node['Rows Removed by Filter'] ?? 0) > 10_000
      ) {
        seqScans.push(
          `${node['Relation Name']} (${node['Actual Rows'] + (node['Rows Removed by Filter'] ?? 0)} rows read)`,
        );
      }
    });
    rows.push({
      name,
      ms: plan['Execution Time'].toFixed(2),
      top:
        plan.Plan['Node Type'] + (plan.Plan['Index Name'] ? ` (${plan.Plan['Index Name']})` : ''),
      seq: seqScans.join(', ') || '—',
    });
  }
  const counts = (
    await pool.query(
      `SELECT relname, n_live_tup FROM pg_stat_user_tables WHERE relname IN
       ('leads','tasks','notifications','messages','auth_sessions','audit_logs','webhook_deliveries','chat_messages')
     ORDER BY relname`,
    )
  ).rows;
  console.log(`Rows: ${counts.map((r) => `${r.relname}=${r.n_live_tup}`).join(', ')}\n`);
  console.log('| Query | Execution ms | Top node | Large sequential scans |');
  console.log('|---|---:|---|---|');
  for (const r of rows) console.log(`| ${r.name} | ${r.ms} | ${r.top} | ${r.seq} |`);
  await pool.end();
}

main().catch(async (error) => {
  console.error(error);
  await pool.end();
  process.exit(1);
});
