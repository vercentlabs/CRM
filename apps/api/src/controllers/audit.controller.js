import pool from '../config/db.js';

/**
 * Get audit logs with pagination
 * @route   GET /audit/logs
 * @desc    Get audit logs with pagination (admin only)
 * @access  Private (Admin only)
 */
const getAuditLogs = async (req, res) => {
  try {
    // Get role of current user from JWT token
    const currentUserRoleId = req.user.roleId;

    // Check if current user is an admin
    if (currentUserRoleId !== 1) { // 1=admin
      return res.status(403).json({
        success: false,
        message: 'Only admins can view audit logs'
      });
    }

    // Pagination parameters with defaults and max limit
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100); // Default 20, max 100
    const offset = (page - 1) * limit;

    // Optional filters
    const { user_id, table_name, action, start_date, end_date } = req.query;

    // Build the query
    let query = `
      SELECT 
        al.id,
        al.user_id,
        u.email as user_email,
        al.action,
        al.table_name,
        al.record_id,
        al.old_values,
        al.new_values,
        al.ip_address,
        al.user_agent,
        al.created_at
      FROM audit_logs al
      LEFT JOIN users u ON al.user_id = u.id
      WHERE 1=1
    `;

    let queryParams = [];
    let paramIndex = 1;

    // Add filters if provided
    if (user_id) {
      query += ` AND al.user_id = $${paramIndex++}`;
      queryParams.push(user_id);
    }

    if (table_name) {
      query += ` AND al.table_name = $${paramIndex++}`;
      queryParams.push(table_name);
    }

    if (action) {
      query += ` AND al.action = $${paramIndex++}`;
      queryParams.push(action);
    }

    if (start_date) {
      query += ` AND al.created_at >= $${paramIndex++}`;
      queryParams.push(start_date);
    }

    if (end_date) {
      query += ` AND al.created_at <= $${paramIndex++}`;
      queryParams.push(end_date);
    }

    // Add ordering and pagination
    query += ` ORDER BY al.created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    queryParams.push(limit, offset);

    // Count query for pagination info
    let countQuery = `
      SELECT COUNT(al.id) as total
      FROM audit_logs al
      WHERE 1=1
    `;

    let countParams = [];
    let countParamIndex = 1;

    // Add same filters to count query
    if (user_id) {
      countQuery += ` AND al.user_id = $${countParamIndex++}`;
      countParams.push(user_id);
    }

    if (table_name) {
      countQuery += ` AND al.table_name = $${countParamIndex++}`;
      countParams.push(table_name);
    }

    if (action) {
      countQuery += ` AND al.action = $${countParamIndex++}`;
      countParams.push(action);
    }

    if (start_date) {
      countQuery += ` AND al.created_at >= $${countParamIndex++}`;
      countParams.push(start_date);
    }

    if (end_date) {
      countQuery += ` AND al.created_at <= $${countParamIndex++}`;
      countParams.push(end_date);
    }

    // Execute both queries in parallel
    const [results, countResult] = await Promise.all([
      pool.query(query, queryParams),
      pool.query(countQuery, countParams)
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
    res.status(500).json({
      success: false,
      message: 'Error retrieving audit logs',
      error: error.message
    });
  }
};

export {
  getAuditLogs
};
