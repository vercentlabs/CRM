#!/usr/bin/env node
/**
 * Backup → restore verification (docs/operations/BACKUP_AND_RECOVERY.md).
 *
 *   VERIFY_ADMIN_URL=postgresql://crm:…@127.0.0.1:55432/postgres \
 *   [PG_DOCKER_CONTAINER=crm-phase2-pg] node packages/database/scripts/backup-restore-verify.mjs
 *
 * 1. Creates a disposable source database (crm_backup_src_<ts>), applies all
 *    migrations and seeds two tenants (users, memberships incl. a user in
 *    both, subscriptions, CRM records, settings, outbox events, sessions).
 * 2. pg_dump -Fc (custom format, the documented production backup format).
 * 3. pg_restore into a fresh database (crm_backup_dst_<ts>).
 * 4. Verifies: every table's row count, per-organization counts of tenant
 *    tables, memberships and roles, subscriptions/plans, pending outbox
 *    events, migration history + checksums, constraint validity, and that
 *    no tenant-owned row lost its organization.
 * 5. Drops both databases (unless KEEP_DATABASES=1).
 *
 * pg_dump/pg_restore run locally, or inside PG_DOCKER_CONTAINER (same major
 * version as the server) when client tools are not installed.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createPool, migrate, MIGRATIONS_DIR } from '../dist/index.js';

const adminUrl = process.env.VERIFY_ADMIN_URL;
if (!adminUrl) {
  console.error('VERIFY_ADMIN_URL (a maintenance connection, e.g. …/postgres) is required.');
  process.exit(2);
}
const container = process.env.PG_DOCKER_CONTAINER;
const stamp = Date.now();
const SRC = `crm_backup_src_${stamp}`;
const DST = `crm_backup_dst_${stamp}`;
const urlFor = (db) => {
  const u = new URL(adminUrl);
  u.pathname = `/${db}`;
  return u.toString();
};

const TENANT_TABLES = [
  'leads',
  'customers',
  'opportunities',
  'tasks',
  'followups',
  'notes',
  'calls',
  'messages',
  'settings',
  'audit_logs',
  'chat_conversations',
  'notifications',
  'outbox_events',
  'files',
  'webhook_endpoints',
  'organization_memberships',
  'subscriptions',
  'usage_counters',
];

function pgTool(tool, args, { input } = {}) {
  const u = new URL(adminUrl);
  const env = { ...process.env, PGPASSWORD: decodeURIComponent(u.password) };
  const conn = [
    '-h',
    container ? '127.0.0.1' : u.hostname,
    '-p',
    container ? '5432' : u.port || '5432',
    '-U',
    decodeURIComponent(u.username),
  ];
  if (container) {
    return execFileSync(
      'docker',
      ['exec', '-i', '-e', `PGPASSWORD=${env.PGPASSWORD}`, container, tool, ...conn, ...args],
      { input, maxBuffer: 1 << 30 },
    );
  }
  return execFileSync(tool, [...conn, ...args], { env, input, maxBuffer: 1 << 30 });
}

async function seed(url) {
  const pool = createPool({ connectionString: url, max: 1 });
  await migrate({
    pool,
    dir: MIGRATIONS_DIR,
    logger: { info: () => undefined, warn: () => undefined },
  });
  const one = async (sql, params = []) => (await pool.query(sql, params)).rows[0];
  const org = async (name, slug) =>
    (await one('INSERT INTO organizations (name, slug) VALUES ($1, $2) RETURNING id', [name, slug]))
      .id;
  const user = async (key) =>
    (
      await one(
        `INSERT INTO users (username, email, password_hash, full_name, is_active) VALUES ($1, $2, 'x', $1, true) RETURNING id`,
        [key, `${key}@example.test`],
      )
    ).id;
  const a = await org('Backup Alpha', 'backup-alpha');
  const b = await org('Backup Beta', 'backup-beta');
  const ua = await user('bk_admin_a');
  const ub = await user('bk_admin_b');
  const both = await user('bk_both');
  const member = (o, u, role, status = 'active') =>
    pool.query(
      `INSERT INTO organization_memberships (organization_id, user_id, role_id, status, joined_at) VALUES ($1, $2, $3, $4, now())`,
      [o, u, role, status],
    );
  await member(a, ua, 1);
  await member(b, ub, 1);
  await member(a, both, 3);
  await member(b, both, 2);
  for (const [o, u, count] of [
    [a, ua, 120],
    [b, ub, 45],
  ]) {
    await pool.query(
      `INSERT INTO leads (organization_id, full_name, mobile_number, assigned_to, created_by)
       SELECT $1, 'Lead ' || g, lpad((9100000000 + g)::text, 10, '0'), $2, $2 FROM generate_series(1, $3::int) g`,
      [o, u, count],
    );
    await pool.query(
      `INSERT INTO tasks (organization_id, title, due_date, assigned_to, created_by)
       SELECT $1, 'Task ' || g, now() + g * interval '1 hour', $2, $2 FROM generate_series(1, 10) g`,
      [o, u],
    );
    await pool.query(
      `INSERT INTO settings (organization_id, key, value) VALUES ($1, 'timezone', '"Asia/Kolkata"')
                      ON CONFLICT (organization_id, key) DO UPDATE SET value = EXCLUDED.value`,
      [o],
    );
    await pool.query(
      `INSERT INTO outbox_events (id, event_type, organization_id, aggregate_type, aggregate_id, payload)
       SELECT gen_random_uuid(), 'lead.created', $1, 'lead', g::text, jsonb_build_object('leadId', g) FROM generate_series(1, 7) g`,
      [o],
    );
    await pool.query(
      `INSERT INTO auth_sessions (user_id, organization_id, client, expires_at) VALUES ($1, $2, 'web', now() + interval '1 day')`,
      [u, o],
    );
  }
  await pool.end();
}

async function snapshot(url) {
  const pool = createPool({ connectionString: url, max: 1 });
  const q = async (sql) => (await pool.query(sql)).rows;
  const tables = (
    await q(`SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`)
  ).map((r) => r.tablename);
  const counts = {};
  for (const t of tables) counts[t] = Number((await q(`SELECT count(*) AS n FROM "${t}"`))[0].n);
  const perTenant = {};
  for (const t of TENANT_TABLES.filter((x) => tables.includes(x))) {
    perTenant[t] =
      await q(`SELECT o.slug, count(x.*)::int AS n FROM organizations o LEFT JOIN "${t}" x ON x.organization_id = o.id
                            GROUP BY o.slug ORDER BY o.slug`);
  }
  const snap = {
    counts,
    perTenant,
    memberships:
      await q(`SELECT o.slug, u.username, r.key AS role, m.status FROM organization_memberships m
                          JOIN organizations o ON o.id = m.organization_id JOIN users u ON u.id = m.user_id
                          JOIN roles r ON r.id = m.role_id ORDER BY 1, 2`),
    subscriptions:
      await q(`SELECT o.slug, p.key AS plan, s.status FROM subscriptions s JOIN organizations o ON o.id = s.organization_id
                            JOIN plans p ON p.id = s.plan_id ORDER BY 1`),
    outboxPending:
      await q(`SELECT organization_id IS NOT NULL AS tenant, count(*)::int AS n FROM outbox_events
                            WHERE processed_at IS NULL GROUP BY 1 ORDER BY 1`),
    migrations: await q(`SELECT version, name, checksum FROM schema_migrations ORDER BY version`),
    grants: await q(`SELECT count(*)::int AS n FROM role_permissions`),
  };
  const orphans = [];
  for (const t of TENANT_TABLES.filter((x) => tables.includes(x) && x !== 'outbox_events')) {
    const n = Number(
      (await q(`SELECT count(*) AS n FROM "${t}" WHERE organization_id IS NULL`))[0].n,
    );
    if (n) orphans.push(`${t}: ${n}`);
  }
  const invalid = await q(
    `SELECT conrelid::regclass AS tbl, conname FROM pg_constraint WHERE NOT convalidated`,
  );
  await pool.end();
  return { snap, orphans, invalid };
}

const admin = createPool({ connectionString: adminUrl, max: 1 });
const dir = mkdtempSync(path.join(tmpdir(), 'crm-backup-'));
let failed = false;
try {
  await admin.query(`CREATE DATABASE ${SRC}`);
  await admin.query(`CREATE DATABASE ${DST}`);
  await seed(urlFor(SRC));
  const before = await snapshot(urlFor(SRC));

  const t0 = Date.now();
  const dump = pgTool('pg_dump', ['-Fc', '--no-owner', '--no-privileges', '-d', SRC]);
  const dumpMs = Date.now() - t0;
  const t1 = Date.now();
  pgTool('pg_restore', ['--no-owner', '--no-privileges', '--exit-on-error', '-d', DST], {
    input: dump,
  });
  const restoreMs = Date.now() - t1;
  const after = await snapshot(urlFor(DST));

  const checks = [
    ['table row counts', before.snap.counts, after.snap.counts],
    ['per-organization tenant rows', before.snap.perTenant, after.snap.perTenant],
    ['memberships and roles', before.snap.memberships, after.snap.memberships],
    ['subscriptions and plans', before.snap.subscriptions, after.snap.subscriptions],
    ['pending outbox events', before.snap.outboxPending, after.snap.outboxPending],
    ['migration history and checksums', before.snap.migrations, after.snap.migrations],
    ['role grants', before.snap.grants, after.snap.grants],
  ];
  for (const [name, a, b] of checks) {
    const ok = JSON.stringify(a) === JSON.stringify(b);
    failed ||= !ok;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  }
  const tenantOk = after.orphans.length === 0;
  const constraintsOk = after.invalid.length === 0;
  failed ||= !tenantOk || !constraintsOk;
  console.log(
    `${tenantOk ? 'PASS' : 'FAIL'}  every tenant-owned row keeps its organization${tenantOk ? '' : ` (${after.orphans.join(', ')})`}`,
  );
  console.log(`${constraintsOk ? 'PASS' : 'FAIL'}  all constraints valid after restore`);
  const tables = Object.keys(after.snap.counts).length;
  const rows = Object.values(after.snap.counts).reduce((s, n) => s + n, 0);
  console.log(
    `\n${tables} tables, ${rows} rows; dump ${dump.length} bytes in ${dumpMs} ms, restore ${restoreMs} ms` +
      ` (${after.snap.migrations.length} migrations).`,
  );
} catch (error) {
  failed = true;
  console.error('FAIL ', error instanceof Error ? error.message : error);
} finally {
  if (process.env.KEEP_DATABASES !== '1') {
    await admin.query(`DROP DATABASE IF EXISTS ${SRC}`).catch(() => undefined);
    await admin.query(`DROP DATABASE IF EXISTS ${DST}`).catch(() => undefined);
  }
  await admin.end();
  rmSync(dir, { recursive: true, force: true });
}
process.exitCode = failed ? 1 : 0;
