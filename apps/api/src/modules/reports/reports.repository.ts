import type { Queryable } from '@crm/database';
import type { Tenant } from '../../platform/tenancy.js';

/**
 * Read-only report queries. Every query starts from `organization_id = $1`;
 * `ownerId` (OWN scope) narrows to the member's records using the table's
 * ownership column. Column names below are fixed literals, never input.
 */

type OwnerColumn = 'assigned_to' | 'user_id';

interface Filter {
  conditions: string[];
  params: unknown[];
}

/** Tenant (+ optional owner) filter; extra conditions are appended as fixed SQL with params. */
export function tenantFilter(
  tenant: Tenant,
  ownerId: number | null,
  ownerColumn: OwnerColumn,
): Filter {
  const filter: Filter = { conditions: ['organization_id = $1'], params: [tenant.organizationId] };
  if (ownerId !== null) {
    filter.params.push(ownerId);
    filter.conditions.push(`${ownerColumn} = $${filter.params.length}`);
  }
  return filter;
}

function withParam(filter: Filter, sql: (param: string) => string, value: unknown): Filter {
  const params = [...filter.params, value];
  return { params, conditions: [...filter.conditions, sql(`$${params.length}`)] };
}

const where = (filter: Filter, extra: string[] = []) =>
  `WHERE ${[...filter.conditions, ...extra].join(' AND ')}`;

async function count(
  db: Queryable,
  table: 'leads' | 'followups' | 'calls' | 'messages',
  filter: Filter,
  extra: string[] = [],
) {
  const result = await db.query(
    `SELECT COUNT(*) AS count FROM ${table} ${where(filter, extra)}`,
    filter.params,
  );
  return Number(result.rows[0].count);
}

export async function dashboardSummary(db: Queryable, tenant: Tenant, ownerId: number | null) {
  const leads = tenantFilter(tenant, ownerId, 'assigned_to');
  const followups = tenantFilter(tenant, ownerId, 'assigned_to');
  const activity = tenantFilter(tenant, ownerId, 'user_id');
  const [totalLeads, byStatus, pendingFollowups, overdueFollowups, callsToday, messagesToday] =
    await Promise.all([
      count(db, 'leads', leads),
      db.query(
        `SELECT status, COUNT(*)::int AS count FROM leads ${where(leads)} GROUP BY status ORDER BY status`,
        leads.params,
      ),
      count(db, 'followups', followups, ["status = 'Pending'"]),
      count(db, 'followups', followups, ["status = 'Pending'", 'followup_date < NOW()']),
      count(db, 'calls', activity, ['DATE(start_time) = CURRENT_DATE']),
      count(db, 'messages', activity, ['DATE(sent_at) = CURRENT_DATE']),
    ]);
  return {
    totalLeads,
    leadsByStatus: byStatus.rows as { status: string; count: number }[],
    pendingFollowups,
    overdueFollowups,
    callsToday,
    messagesToday,
  };
}

/** Per-member lead totals for active non-admin members of the organization. */
export async function salesPerformance(
  db: Queryable,
  tenant: Tenant,
  days: number,
  memberId?: number,
) {
  const params: unknown[] = [tenant.organizationId, days];
  let memberFilter = '';
  if (memberId !== undefined) {
    params.push(memberId);
    memberFilter = `AND u.id = $${params.length}`;
  }
  const result = await db.query(
    `SELECT u.id, u.full_name AS name, u.email,
            COUNT(l.id)::int AS total_leads,
            (COUNT(l.id) FILTER (WHERE l.status = 'Converted'))::int AS converted_leads
     FROM organization_memberships m
     JOIN users u ON u.id = m.user_id
     JOIN roles r ON r.id = m.role_id
     LEFT JOIN leads l
       ON l.assigned_to = u.id AND l.organization_id = m.organization_id
      AND l.created_at >= NOW() - make_interval(days => $2)
     WHERE m.organization_id = $1 AND m.status = 'active' AND r.key <> 'admin' ${memberFilter}
     GROUP BY u.id
     ORDER BY u.full_name`,
    params,
  );
  return result.rows as {
    id: number;
    name: string;
    email: string;
    total_leads: number;
    converted_leads: number;
  }[];
}

export async function leadAging(db: Queryable, tenant: Tenant, ownerId: number | null) {
  const filter = tenantFilter(tenant, ownerId, 'assigned_to');
  const result = await db.query(
    `SELECT
       COUNT(*) FILTER (WHERE age <= 1)::int AS "0-1_days",
       COUNT(*) FILTER (WHERE age BETWEEN 2 AND 3)::int AS "2-3_days",
       COUNT(*) FILTER (WHERE age BETWEEN 4 AND 7)::int AS "4-7_days",
       COUNT(*) FILTER (WHERE age > 7)::int AS "7+_days"
     FROM (SELECT EXTRACT(DAYS FROM NOW() - created_at) AS age FROM leads ${where(filter)}) AS aged`,
    filter.params,
  );
  return result.rows[0] as Record<'0-1_days' | '2-3_days' | '4-7_days' | '7+_days', number>;
}

export async function conversionFunnel(
  db: Queryable,
  tenant: Tenant,
  options: { ownerId: number | null; days?: number | undefined; memberId?: number | undefined },
) {
  let filter = tenantFilter(tenant, options.ownerId, 'assigned_to');
  if (options.days !== undefined)
    filter = withParam(
      filter,
      (p) => `created_at >= NOW() - make_interval(days => ${p})`,
      options.days,
    );
  if (options.memberId !== undefined)
    filter = withParam(filter, (p) => `assigned_to = ${p}`, options.memberId);
  const result = await db.query(
    `SELECT status, COUNT(*)::int AS count FROM leads ${where(filter)}
     GROUP BY status
     ORDER BY CASE status WHEN 'New' THEN 1 WHEN 'Contacted' THEN 2 WHEN 'Qualified' THEN 3 WHEN 'Converted' THEN 4 ELSE 5 END`,
    filter.params,
  );
  return result.rows as { status: string; count: number }[];
}

export async function leadsForExport(db: Queryable, tenant: Tenant, ownerId: number | null) {
  const params: unknown[] = [tenant.organizationId];
  let sql = `
    SELECT l.id, l.full_name, l.mobile_number, l.email, l.status, l.created_at, u.full_name AS assigned_to_name
    FROM leads l LEFT JOIN users u ON u.id = l.assigned_to
    WHERE l.organization_id = $1`;
  if (ownerId !== null) {
    params.push(ownerId);
    sql += ` AND l.assigned_to = $${params.length}`;
  }
  const result = await db.query(`${sql} ORDER BY l.created_at DESC, l.id DESC`, params);
  return result.rows as {
    id: number;
    full_name: string;
    mobile_number: string;
    email: string | null;
    status: string;
    created_at: Date;
    assigned_to_name: string | null;
  }[];
}

const BUCKETS = {
  today: { select: 'EXTRACT(HOUR FROM created_at)', window: 'DATE(created_at) = CURRENT_DATE' },
  week: {
    select: 'EXTRACT(DOW FROM created_at)',
    window: "created_at >= DATE_TRUNC('week', CURRENT_DATE)",
  },
  month: {
    select: 'EXTRACT(WEEK FROM created_at)',
    window: "DATE_TRUNC('month', created_at) = DATE_TRUNC('month', CURRENT_DATE)",
  },
} as const;

export async function leadsOverTime(
  db: Queryable,
  tenant: Tenant,
  ownerId: number | null,
  period: keyof typeof BUCKETS,
) {
  const filter = tenantFilter(tenant, ownerId, 'assigned_to');
  const bucket = BUCKETS[period];
  const result = await db.query(
    `SELECT ${bucket.select}::int AS bucket, COUNT(*)::int AS leads FROM leads ${where(filter, [bucket.window])}
     GROUP BY bucket ORDER BY bucket`,
    filter.params,
  );
  return result.rows as { bucket: number; leads: number }[];
}
