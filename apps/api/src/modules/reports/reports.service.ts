import { pool } from '../../platform/db.js';
import { AppError } from '../../platform/http/errors.js';
import { ownerFilter, type Actor } from '../../platform/tenancy.js';
import * as reports from './reports.repository.js';

/** Reports aggregate only the actor's organization; OWN scope narrows to their records. */

export const dashboardSummary = (actor: Actor) =>
  reports.dashboardSummary(pool, actor, ownerFilter(actor, 'crm.reports.read'));

export async function salesPerformance(actor: Actor, days: number, memberId?: number) {
  const rows = await reports.salesPerformance(pool, actor, days, memberId);
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    totalLeads: row.total_leads,
    convertedLeads: row.converted_leads,
    conversionRate:
      row.total_leads > 0 ? Number(((row.converted_leads / row.total_leads) * 100).toFixed(2)) : 0,
  }));
}

export const leadAging = (actor: Actor) =>
  reports.leadAging(pool, actor, ownerFilter(actor, 'crm.reports.read'));

/** Lead counts by status; a member filter only applies with organization scope. */
export async function conversion(
  actor: Actor,
  options: { days?: number | undefined; memberId?: number | undefined },
) {
  const ownerId = ownerFilter(actor, 'crm.reports.read');
  const rows = await reports.conversionFunnel(pool, actor, {
    ownerId,
    days: options.days,
    memberId: ownerId === null ? options.memberId : undefined,
  });
  return Object.fromEntries(rows.map((row) => [row.status, row.count])) as Record<string, number>;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export async function leadsOverTime(actor: Actor, period: 'today' | 'week' | 'month') {
  const rows = await reports.leadsOverTime(
    pool,
    actor,
    ownerFilter(actor, 'crm.reports.read'),
    period,
  );
  return rows.map((row) => ({
    time:
      period === 'today'
        ? `${row.bucket}:00`
        : period === 'week'
          ? DAYS[row.bucket]
          : `Week ${row.bucket}`,
    leads: row.leads,
  }));
}

/** Quotes a CSV cell and neutralises spreadsheet formula injection. */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '""';
  let text = String(value).trim().replace(/\r?\n/g, ' ');
  if (/^[=+\-@\t]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export async function leadsCsv(actor: Actor): Promise<string> {
  const leads = await reports.leadsForExport(pool, actor, ownerFilter(actor, 'crm.reports.export'));
  if (leads.length === 0) throw AppError.notFound('No leads found');
  const exportDate = new Date().toISOString().split('T')[0];
  const lines = [
    `# Exported By: ${actor.email} | Export Date: ${exportDate}`,
    [
      'ID',
      'Full Name',
      'Mobile Number',
      'Email',
      'Status',
      'Created Date',
      'Assigned Sales / Manager',
    ].join(','),
    ...leads.map((lead) =>
      [
        lead.id,
        csvCell(lead.full_name),
        csvCell(lead.mobile_number),
        csvCell(lead.email),
        csvCell(lead.status ? lead.status.charAt(0).toUpperCase() + lead.status.slice(1) : ''),
        csvCell(new Date(lead.created_at).toISOString().split('T')[0]),
        csvCell(lead.assigned_to_name || 'Unassigned'),
      ].join(','),
    ),
  ];
  return `${lines.join('\n')}\n`;
}
