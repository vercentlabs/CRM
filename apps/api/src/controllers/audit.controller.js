import pool from '../config/db.js';
import { parseId, serverError, tenantOf } from '../platform/tenancy.js';

/**
 * Get the organization's audit log (never other organizations' or platform rows)
 * @route   GET /audit
 * @access  settings.audit.read
 */
const getAuditLogs = async (req, res) => {
  try {
    const { organizationId } = tenantOf(req);
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const offset = (page - 1) * limit;

    const { user_id, table_name, action, start_date, end_date } = req.query;

    const conditions = ['al.organization_id = $1'];
    const params = [organizationId];
    const add = (sql, value) => {
      params.push(value);
      conditions.push(`${sql} $${params.length}`);
    };

    if (user_id) add('al.user_id =', parseId(user_id) ?? 0);
    if (table_name) add('al.table_name =', String(table_name));
    if (action) add('al.action =', String(action));
    if (start_date) add('al.created_at >=', start_date);
    if (end_date) add('al.created_at <=', end_date);

    const where = `WHERE ${conditions.join(' AND ')}`;

    const [results, countResult] = await Promise.all([
      pool.query(
        `SELECT al.id, al.user_id, u.email as user_email, al.action, al.table_name, al.record_id,
                al.old_values, al.new_values, al.ip_address, al.user_agent, al.request_id, al.created_at
         FROM audit_logs al
         LEFT JOIN users u ON al.user_id = u.id
         ${where}
         ORDER BY al.created_at DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset]
      ),
      pool.query(`SELECT COUNT(al.id) as total FROM audit_logs al ${where}`, params)
    ]);

    const totalItems = parseInt(countResult.rows[0].total);
    const totalPages = Math.ceil(totalItems / limit);

    res.status(200).json({
      success: true,
      audit_logs: results.rows,
      pagination: {
        page,
        limit,
        totalItems,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      }
    });
  } catch (error) {
    if (error.code === '22007' || error.code === '22008') {
      return res.status(400).json({ success: false, message: 'Invalid date filter' });
    }
    return serverError(res, 'Error retrieving audit logs', error);
  }
};

export {
  getAuditLogs
};
