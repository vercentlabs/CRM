import pool from '../config/db.js';
import { parseId, scopeFor, serverError, tenantOf } from '../platform/tenancy.js';

/**
 * Reports aggregate ONLY the caller's organization. With `own` scope the
 * aggregates are further limited to the caller's own records.
 *
 * `scopedFilter` returns SQL conditions + params starting at $1 for the
 * organization, with an optional ownership column.
 */
const scopedFilter = (req, permission, ownerColumn) => {
  const { organizationId, userId } = tenantOf(req);
  const conditions = ['organization_id = $1'];
  const params = [organizationId];
  if (scopeFor(req, permission) !== 'organization') {
    params.push(userId);
    conditions.push(`${ownerColumn} = $${params.length}`);
  }
  return { conditions, params };
};

const countWhere = async (table, filter, extraConditions = []) => {
  const where = [...filter.conditions, ...extraConditions].join(' AND ');
  const result = await pool.query(`SELECT COUNT(*) AS count FROM ${table} WHERE ${where}`, filter.params);
  return parseInt(result.rows[0].count);
};

/**
 * Get dashboard summary with key metrics
 * @route   GET /reports/dashboard-summary
 * @access  crm.reports.read
 */
const getDashboardSummary = async (req, res) => {
  try {
    const leads = scopedFilter(req, 'crm.reports.read', 'assigned_to');
    const followups = scopedFilter(req, 'crm.reports.read', 'assigned_to');
    const calls = scopedFilter(req, 'crm.reports.read', 'user_id');
    const messages = scopedFilter(req, 'crm.reports.read', 'user_id');

    const [totalLeads, leadsByStatusResult, pendingFollowups, overdueFollowups, callsToday, messagesToday] =
      await Promise.all([
        countWhere('leads', leads),
        pool.query(
          `SELECT status, COUNT(*) as count FROM leads WHERE ${leads.conditions.join(' AND ')} GROUP BY status`,
          leads.params
        ),
        countWhere('followups', followups, ["status = 'Pending'"]),
        countWhere('followups', followups, ["status = 'Pending'", 'followup_date < NOW()']),
        countWhere('calls', calls, ['DATE(start_time) = CURRENT_DATE']),
        countWhere('messages', messages, ['DATE(sent_at) = CURRENT_DATE'])
      ]);

    res.status(200).json({
      totalLeads,
      leadsByStatus: leadsByStatusResult.rows,
      pendingFollowups,
      overdueFollowups,
      callsToday,
      messagesToday
    });
  } catch (error) {
    return serverError(res, 'Error fetching dashboard summary', error);
  }
};

/**
 * Get sales performance report (members of the organization with a non-admin role)
 * @route   GET /reports/sales-performance
 * @access  crm.reports.read with organization scope
 */
const getSalesPerformance = async (req, res) => {
  try {
    const { organizationId } = tenantOf(req);
    const days = Math.min(Math.max(parseInt(req.query.days) || 30, 1), 3650);
    const selectedUserId = req.query.userId ? parseId(req.query.userId) : null;

    const params = [organizationId, days];
    let memberFilter = '';
    if (req.query.userId) {
      params.push(selectedUserId ?? 0);
      memberFilter = `AND u.id = $${params.length}`;
    }

    const result = await pool.query(
      `SELECT u.id, u.full_name AS name, u.email,
              COUNT(l.id) AS total_leads,
              COUNT(l.id) FILTER (WHERE l.status = 'Converted') AS converted_leads
       FROM organization_memberships m
       JOIN users u ON u.id = m.user_id
       JOIN roles r ON r.id = m.role_id
       LEFT JOIN leads l
         ON l.assigned_to = u.id
        AND l.organization_id = m.organization_id
        AND l.created_at >= NOW() - make_interval(days => $2)
       WHERE m.organization_id = $1 AND m.status = 'active' AND r.key <> 'admin' ${memberFilter}
       GROUP BY u.id
       ORDER BY u.full_name`,
      params
    );

    const salesPerformance = result.rows.map((row) => {
      const totalLeads = parseInt(row.total_leads);
      const convertedLeads = parseInt(row.converted_leads);
      return {
        id: row.id,
        name: row.name,
        email: row.email,
        totalLeads,
        convertedLeads,
        conversionRate: totalLeads > 0 ? parseFloat(((convertedLeads / totalLeads) * 100).toFixed(2)) : 0
      };
    });

    res.status(200).json({
      data: salesPerformance
    });
  } catch (error) {
    return serverError(res, 'Error fetching sales performance', error);
  }
};

/**
 * Get lead aging report
 * @route   GET /reports/lead-aging
 * @access  crm.reports.read
 */
const getLeadAging = async (req, res) => {
  try {
    const filter = scopedFilter(req, 'crm.reports.read', 'assigned_to');
    const result = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE age <= 1) AS "0-1_days",
         COUNT(*) FILTER (WHERE age BETWEEN 2 AND 3) AS "2-3_days",
         COUNT(*) FILTER (WHERE age BETWEEN 4 AND 7) AS "4-7_days",
         COUNT(*) FILTER (WHERE age > 7) AS "7+_days"
       FROM (
         SELECT EXTRACT(DAYS FROM NOW() - created_at) AS age
         FROM leads
         WHERE ${filter.conditions.join(' AND ')}
       ) AS aged_leads`,
      filter.params
    );
    const row = result.rows[0];

    res.status(200).json({
      '0-1_days': parseInt(row['0-1_days']),
      '2-3_days': parseInt(row['2-3_days']),
      '4-7_days': parseInt(row['4-7_days']),
      '7+_days': parseInt(row['7+_days'])
    });
  } catch (error) {
    return serverError(res, 'Error fetching lead aging report', error);
  }
};

/**
 * Get conversion report (lead counts by status)
 * @route   GET /reports/conversion-report
 * @access  crm.reports.read
 */
const getConversionReport = async (req, res) => {
  try {
    const filter = scopedFilter(req, 'crm.reports.read', 'assigned_to');
    const { days, userId: selectedUserId } = req.query;

    if (days !== undefined) {
      // Parameterized (the pre-Phase-2 code interpolated `days` into SQL).
      const dayCount = /^\d{1,4}$/.test(String(days)) ? Number(days) : NaN;
      if (!Number.isInteger(dayCount) || dayCount < 1 || dayCount > 3650) {
        return res.status(400).json({ message: 'days must be an integer between 1 and 3650' });
      }
      filter.params.push(dayCount);
      filter.conditions.push(`created_at >= NOW() - make_interval(days => $${filter.params.length})`);
    }

    if (selectedUserId && scopeFor(req, 'crm.reports.read') === 'organization') {
      filter.params.push(parseId(selectedUserId) ?? 0);
      filter.conditions.push(`assigned_to = $${filter.params.length}`);
    }

    const result = await pool.query(
      `SELECT status, COUNT(*) as count
       FROM leads
       WHERE ${filter.conditions.join(' AND ')}
       GROUP BY status
       ORDER BY CASE
         WHEN status = 'New' THEN 1
         WHEN status = 'Contacted' THEN 2
         WHEN status = 'Qualified' THEN 3
         WHEN status = 'Converted' THEN 4
         ELSE 5
       END`,
      filter.params
    );

    const conversionReport = {};
    result.rows.forEach((item) => {
      conversionReport[item.status] = parseInt(item.count);
    });

    res.status(200).json(conversionReport);
  } catch (error) {
    return serverError(res, 'Error fetching conversion report', error);
  }
};

/** Quotes a CSV cell and neutralises spreadsheet formula injection. */
const csvCell = (value) => {
  if (value === null || value === undefined) return '""';
  let text = value.toString().trim().replace(/\r?\n/g, ' ');
  if (/^[=+\-@\t]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
};

/**
 * Export leads to CSV
 * @route   GET /reports/export-leads-csv
 * @access  crm.reports.export (own scope: my leads)
 */
const exportLeadsCSV = async (req, res) => {
  try {
    const { organizationId, userId } = tenantOf(req);
    const params = [organizationId];
    let where = 'WHERE l.organization_id = $1';
    if (scopeFor(req, 'crm.reports.export') !== 'organization') {
      params.push(userId);
      where += ` AND l.assigned_to = $${params.length}`;
    }

    const leadsResult = await pool.query(
      `SELECT l.id, l.full_name, l.mobile_number, l.email, l.status, l.created_at,
              u.full_name as assigned_to_name
       FROM leads l
       LEFT JOIN users u ON l.assigned_to = u.id
       ${where}
       ORDER BY l.created_at DESC`,
      params
    );
    const leads = leadsResult.rows;

    if (leads.length === 0) {
      return res.status(404).json({
        message: 'No leads found'
      });
    }

    const exportDate = new Date().toISOString().split('T')[0];
    const headers = ['ID', 'Full Name', 'Mobile Number', 'Email', 'Status', 'Created Date', 'Assigned Sales / Manager'];
    const csvRows = [`# Exported By: ${req.user.email} | Export Date: ${exportDate}`, headers.join(',')];

    leads.forEach((lead) => {
      csvRows.push(
        [
          lead.id,
          csvCell(lead.full_name),
          csvCell(lead.mobile_number),
          csvCell(lead.email),
          csvCell(lead.status ? lead.status.charAt(0).toUpperCase() + lead.status.slice(1) : ''),
          csvCell(new Date(lead.created_at).toISOString().split('T')[0]),
          csvCell(lead.assigned_to_name || 'Unassigned')
        ].join(',')
      );
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=leads_export.csv');
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).send(`${csvRows.join('\n')}\n`);
  } catch (error) {
    return serverError(res, 'Error exporting leads to CSV', error);
  }
};

/**
 * Get leads over time data
 * @route   GET /reports/leads-over-time
 * @access  crm.reports.read
 */
const getLeadsOverTime = async (req, res) => {
  try {
    const { period = 'month' } = req.query;
    const filter = scopedFilter(req, 'crm.reports.read', 'assigned_to');
    const where = filter.conditions.join(' AND ');
    let result;

    switch (period) {
      case 'today': {
        const rows = await pool.query(
          `SELECT EXTRACT(HOUR FROM created_at) as hour, COUNT(*) as leads
           FROM leads WHERE ${where} AND DATE(created_at) = CURRENT_DATE
           GROUP BY hour ORDER BY hour`,
          filter.params
        );
        result = rows.rows.map((row) => ({ time: `${row.hour}:00`, leads: parseInt(row.leads) }));
        break;
      }
      case 'week': {
        const rows = await pool.query(
          `SELECT EXTRACT(DOW FROM created_at) as day_of_week, COUNT(*) as leads
           FROM leads WHERE ${where} AND created_at >= DATE_TRUNC('week', CURRENT_DATE)
           GROUP BY day_of_week ORDER BY day_of_week`,
          filter.params
        );
        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        result = rows.rows.map((row) => ({ time: days[row.day_of_week], leads: parseInt(row.leads) }));
        break;
      }
      case 'month':
      default: {
        const rows = await pool.query(
          `SELECT EXTRACT(WEEK FROM created_at) as week, COUNT(*) as leads
           FROM leads WHERE ${where} AND DATE_TRUNC('month', created_at) = DATE_TRUNC('month', CURRENT_DATE)
           GROUP BY week ORDER BY week`,
          filter.params
        );
        result = rows.rows.map((row) => ({ time: `Week ${row.week}`, leads: parseInt(row.leads) }));
        break;
      }
    }

    res.status(200).json(result);
  } catch (error) {
    return serverError(res, 'Error fetching leads over time', error);
  }
};

export {
  getDashboardSummary,
  getSalesPerformance,
  getLeadAging,
  getConversionReport,
  exportLeadsCSV,
  getLeadsOverTime
};
