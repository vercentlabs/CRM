import type { Queryable } from '@crm/database';

export interface NewNotification {
  organizationId: number;
  userId: number;
  type: string;
  title: string;
  body: string | null;
  entity: { type: 'lead' | 'task' | 'opportunity'; id: number } | null;
  dedupeKey: string;
}

/**
 * Inserts a notification for an ACTIVE member of the organization only.
 * (organization_id, user_id, dedupe_key) is unique, so replays are no-ops.
 * Returns true when a new row was created.
 */
export async function notify(db: Queryable, n: NewNotification): Promise<boolean> {
  const result = await db.query(
    `INSERT INTO notifications (organization_id, user_id, type, title, body, entity_type, entity_id, dedupe_key)
     SELECT $1, $2, $3, $4, $5, $6, $7, $8
     WHERE EXISTS (
       SELECT 1 FROM organization_memberships m JOIN users u ON u.id = m.user_id
       WHERE m.organization_id = $1 AND m.user_id = $2 AND m.status = 'active'
         AND COALESCE(u.is_active, true))
     ON CONFLICT (organization_id, user_id, dedupe_key) DO NOTHING`,
    [
      n.organizationId,
      n.userId,
      n.type,
      n.title.slice(0, 200),
      n.body?.slice(0, 500) ?? null,
      n.entity?.type ?? null,
      n.entity?.id ?? null,
      n.dedupeKey,
    ],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function leadName(db: Queryable, organizationId: number, leadId: number) {
  const result = await db.query(
    'SELECT full_name FROM leads WHERE id = $1 AND organization_id = $2',
    [leadId, organizationId],
  );
  return (result.rows[0]?.full_name as string | undefined) ?? null;
}

export async function taskTitle(db: Queryable, organizationId: number, taskId: number) {
  const result = await db.query('SELECT title FROM tasks WHERE id = $1 AND organization_id = $2', [
    taskId,
    organizationId,
  ]);
  return (result.rows[0]?.title as string | undefined) ?? null;
}

export async function opportunity(db: Queryable, organizationId: number, opportunityId: number) {
  const result = await db.query(
    'SELECT title, assigned_to FROM opportunities WHERE id = $1 AND organization_id = $2',
    [opportunityId, organizationId],
  );
  return (result.rows[0] as { title: string; assigned_to: number | null } | undefined) ?? null;
}

/**
 * Organization time zones for reminder text: only names PostgreSQL knows
 * (pg_timezone_names) are used; anything else falls back to UTC.
 */
const ZONES = `WITH zones AS (
    SELECT st.organization_id, z.name
    FROM settings st JOIN pg_timezone_names z ON z.name = btrim(st.value, '" ')
    WHERE st.key = 'timezone'
  )`;
/**
 * "02 Jul 2026, 00:15 Asia/Kolkata": due time in the organization's zone.
 * Legacy naive TIMESTAMP columns are read in the session zone, exactly like
 * the window comparisons against now().
 */
const localTime = (column: string) =>
  `to_char((${column})::timestamptz AT TIME ZONE COALESCE(zn.name, 'UTC'), 'DD Mon YYYY, HH24:MI') || ' ' || COALESCE(zn.name, 'UTC')`;

/**
 * Reminder scan. Each statement is a single idempotent INSERT…SELECT across
 * organizations: every candidate row carries its own organization_id, the
 * recipient must be an active member of THAT organization, and the dedupe
 * key includes the due timestamp, so a reminder fires once per due time
 * (rescheduling creates a new one). Windows are bounded and indexed.
 */
export async function createDueReminders(
  db: Queryable,
  windows: { followupDueMinutes: number; taskDueMinutes: number; overdueLookbackDays: number },
): Promise<{ followupsDue: number; followupsOverdue: number; tasksDue: number }> {
  const activeMember = `EXISTS (SELECT 1 FROM organization_memberships m JOIN users u ON u.id = m.user_id
      WHERE m.organization_id = x.organization_id AND m.user_id = x.user_id AND m.status = 'active'
        AND COALESCE(u.is_active, true))`;
  const insert = (select: string, params: unknown[]) =>
    db.query(
      `INSERT INTO notifications (organization_id, user_id, type, title, body, entity_type, entity_id, dedupe_key)
       SELECT x.organization_id, x.user_id, x.type, x.title, x.body, x.entity_type, x.entity_id, x.dedupe_key
       FROM (${select}) x
       WHERE ${activeMember}
       ON CONFLICT (organization_id, user_id, dedupe_key) DO NOTHING`,
      params,
    );

  const followupsDue = await insert(
    `${ZONES}
     SELECT l.organization_id, l.assigned_to AS user_id, 'followup.due' AS type,
            'Follow-up due soon' AS title, l.full_name || ' · ' || ${localTime('l.next_call_at')} AS body,
            'lead' AS entity_type, l.id AS entity_id,
            'followup.due.' || l.id || '.' || extract(epoch FROM l.next_call_at)::bigint AS dedupe_key
     FROM leads l
     LEFT JOIN zones zn ON zn.organization_id = l.organization_id
     WHERE l.next_call_at IS NOT NULL AND l.assigned_to IS NOT NULL
       AND l.next_call_at > now() AND l.next_call_at <= now() + make_interval(mins => $1)`,
    [windows.followupDueMinutes],
  );
  const followupsOverdue = await insert(
    `${ZONES}
     SELECT l.organization_id, l.assigned_to AS user_id, 'followup.overdue' AS type,
            'Follow-up overdue' AS title, l.full_name || ' · ' || ${localTime('l.next_call_at')} AS body,
            'lead' AS entity_type, l.id AS entity_id,
            'followup.overdue.' || l.id || '.' || extract(epoch FROM l.next_call_at)::bigint AS dedupe_key
     FROM leads l
     LEFT JOIN zones zn ON zn.organization_id = l.organization_id
     WHERE l.next_call_at IS NOT NULL AND l.assigned_to IS NOT NULL
       AND l.next_call_at <= now() AND l.next_call_at > now() - make_interval(days => $1)
       AND l.status NOT IN ('Converted', 'Lost')`,
    [windows.overdueLookbackDays],
  );
  const tasksDue = await insert(
    `${ZONES}
     SELECT t.organization_id, t.assigned_to AS user_id, 'task.due' AS type,
            'Task due soon' AS title, t.title || ' · ' || ${localTime('t.due_date')} AS body,
            'task' AS entity_type, t.id AS entity_id,
            'task.due.' || t.id || '.' || extract(epoch FROM t.due_date)::bigint AS dedupe_key
     FROM tasks t
     LEFT JOIN zones zn ON zn.organization_id = t.organization_id
     WHERE t.assigned_to IS NOT NULL AND t.status IN ('pending', 'in_progress')
       AND t.due_date > now() AND t.due_date <= now() + make_interval(mins => $1)`,
    [windows.taskDueMinutes],
  );
  return {
    followupsDue: followupsDue.rowCount ?? 0,
    followupsOverdue: followupsOverdue.rowCount ?? 0,
    tasksDue: tasksDue.rowCount ?? 0,
  };
}
