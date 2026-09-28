import type { Queryable } from '@crm/database';
import type { Followup, FollowupScheduleItem } from '@crm/types';
import type { Tenant } from '../../platform/tenancy.js';

/**
 * Follow-ups. Two historical concepts coexist and are both preserved:
 * - the follow-up *schedule*: leads with `next_call_at` (what the lists show);
 * - `followups` rows: scheduled contacts that get completed.
 * OWN scope = assigned to me (lead.assigned_to for the schedule).
 */

const FOLLOWUP_COLUMNS =
  'f.id, f.lead_id, f.assigned_to, f.followup_date, f.followup_type, f.notes, f.status, f.completed_at, f.created_at, f.updated_at';

export async function schedule(
  db: Queryable,
  tenant: Tenant,
  filter: { ownerId: number | null; overdueOnly: boolean },
): Promise<FollowupScheduleItem[]> {
  const params: unknown[] = [tenant.organizationId];
  let sql = `
    SELECT l.id AS lead_id, l.full_name AS lead_name, l.email AS lead_email, l.mobile_number AS lead_mobile,
           l.status AS lead_status, l.next_call_at, l.assigned_to, u.full_name AS assigned_to_name,
           (l.next_call_at < NOW()) AS overdue
    FROM leads l
    LEFT JOIN users u ON u.id = l.assigned_to
    WHERE l.organization_id = $1 AND l.next_call_at IS NOT NULL`;
  if (filter.overdueOnly) sql += ' AND l.next_call_at < NOW()';
  if (filter.ownerId !== null) {
    params.push(filter.ownerId);
    sql += ` AND l.assigned_to = $${params.length}`;
  }
  const result = await db.query(`${sql} ORDER BY l.next_call_at ASC, l.id`, params);
  return result.rows;
}

export async function findById(
  db: Queryable,
  tenant: Tenant,
  id: number,
): Promise<Followup | null> {
  const result = await db.query(
    `SELECT ${FOLLOWUP_COLUMNS} FROM followups f WHERE f.id = $1 AND f.organization_id = $2`,
    [id, tenant.organizationId],
  );
  return result.rows[0] ?? null;
}

export async function insert(
  db: Queryable,
  tenant: Tenant,
  data: {
    lead_id: number;
    assigned_to: number;
    followup_date: string;
    followup_type: string;
    notes: string | null;
  },
): Promise<Followup> {
  const result = await db.query(
    `INSERT INTO followups (organization_id, lead_id, assigned_to, followup_date, followup_type, status, notes)
     VALUES ($1, $2, $3, $4, $5, 'Pending', $6)
     RETURNING id, lead_id, assigned_to, followup_date, followup_type, notes, status, completed_at, created_at, updated_at`,
    [
      tenant.organizationId,
      data.lead_id,
      data.assigned_to,
      data.followup_date,
      data.followup_type,
      data.notes,
    ],
  );
  return result.rows[0];
}

export async function setStatus(
  db: Queryable,
  tenant: Tenant,
  id: number,
  status: string,
): Promise<void> {
  await db.query(
    'UPDATE followups SET status = $1, completed_at = NOW() WHERE id = $2 AND organization_id = $3',
    [status, id, tenant.organizationId],
  );
}
