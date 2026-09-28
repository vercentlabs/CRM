import pool from '../config/db.js';

/**
 * Get dashboard summary with key metrics
 * @route   GET /report/dashboard-summary
 * @desc    Get dashboard summary with leads, followups, calls and messages metrics
 * @access  Private
 */
const getDashboardSummary = async (req, res) => {
  try {
    const { roleId, userId } = req.user;

    // Base query conditions based on user role
    const isAdminOrManager = roleId === 1 || roleId === 2; // Assuming 1=admin, 2=manager

    // Get total leads count
    const totalLeadsQuery = `SELECT COUNT(*) as count FROM leads ${isAdminOrManager ? '' : 'WHERE assigned_to = $1'}`;
    const totalLeadsParams = isAdminOrManager ? [] : [userId];
    const totalLeadsResult = await pool.query(totalLeadsQuery, totalLeadsParams);
    const totalLeads = parseInt(totalLeadsResult.rows[0].count);

    // Get leads by status
    const leadsByStatusQuery = `
      SELECT status, COUNT(*) as count
      FROM leads
      ${isAdminOrManager ? '' : 'WHERE assigned_to = $1'}
      GROUP BY status
    `;
    const leadsByStatusParams = isAdminOrManager ? [] : [userId];
    const leadsByStatusResult = await pool.query(leadsByStatusQuery, leadsByStatusParams);
    const leadsByStatus = leadsByStatusResult.rows;

    // Get pending followups
    const pendingFollowupsQuery = `
      SELECT COUNT(*) as count
      FROM followups
      ${isAdminOrManager ? 'WHERE' : 'WHERE assigned_to = $1 AND'} status = 'Pending'
    `;
    const pendingFollowupsParams = isAdminOrManager ? [] : [userId];
    const pendingFollowupsResult = await pool.query(pendingFollowupsQuery, pendingFollowupsParams);
    const pendingFollowups = parseInt(pendingFollowupsResult.rows[0].count);

    // Get overdue followups
    const overdueFollowupsQuery = `
      SELECT COUNT(*) as count
      FROM followups
      ${isAdminOrManager ? 'WHERE' : 'WHERE assigned_to = $1 AND'}
      status = 'Pending' AND followup_date < NOW()
    `;
    const overdueFollowupsParams = isAdminOrManager ? [] : [userId];
    const overdueFollowupsResult = await pool.query(overdueFollowupsQuery, overdueFollowupsParams);
    const overdueFollowups = parseInt(overdueFollowupsResult.rows[0].count);

    // Get calls today
    const callsTodayQuery = `
      SELECT COUNT(*) as count
      FROM calls
      ${isAdminOrManager ? 'WHERE' : 'WHERE user_id = $1 AND'}
      DATE(start_time) = CURRENT_DATE
    `;
    const callsTodayParams = isAdminOrManager ? [] : [userId];
    const callsTodayResult = await pool.query(callsTodayQuery, callsTodayParams);
    const callsToday = parseInt(callsTodayResult.rows[0].count);

    // Get messages today
    const messagesTodayQuery = `
      SELECT COUNT(*) as count
      FROM messages
      ${isAdminOrManager ? 'WHERE' : 'WHERE user_id = $1 AND'}
      DATE(sent_at) = CURRENT_DATE
    `;
    const messagesTodayParams = isAdminOrManager ? [] : [userId];
    const messagesTodayResult = await pool.query(messagesTodayQuery, messagesTodayParams);
    const messagesToday = parseInt(messagesTodayResult.rows[0].count);

    // Return the dashboard summary
    res.status(200).json({
      totalLeads,
      leadsByStatus,
      pendingFollowups,
      overdueFollowups,
      callsToday,
      messagesToday
    });
  } catch (error) {
    console.error('Error fetching dashboard summary:', error);
    res.status(500).json({
      message: 'Error fetching dashboard summary',
      error: error.message
    });
  }
};

/**
 * Get sales performance report
 * @route   GET /sales-performance
 * @desc    Get performance metrics for each sales user
 * @access  Private (Admin/Manager only)
 */
const getSalesPerformance = async (req, res) => {
  try {
    const { roleId } = req.user;
    const { days = 30, userId } = req.query;

    // Check if user is admin or manager
    if (roleId !== 1 && roleId !== 2) {
      return res.status(403).json({
        message: 'Access denied. Admin or Manager privileges required.'
      });
    }

    // Get all sales users (Managers and Sales)
    const salesUsersQuery = `
      SELECT id, full_name, email
      FROM users
      WHERE role_id IN ($1, $2)
    `;
    const salesUsersResult = await pool.query(salesUsersQuery, [2, 3]);
    let salesUsers = salesUsersResult.rows;

    // Filter by specific user if provided
    if (userId) {
      salesUsers = salesUsers.filter(user => user.id === parseInt(userId));
    }

    // Calculate the date range
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    // For each sales user, get their performance metrics
    const salesPerformance = [];

    for (const user of salesUsers) {
      // Get total leads assigned within the date range
      const totalLeadsQuery = `
        SELECT COUNT(*) as count
        FROM leads
        WHERE assigned_to = $1 AND created_at >= $2
      `;
      const totalLeadsResult = await pool.query(totalLeadsQuery, [user.id, startDate]);
      const totalLeads = parseInt(totalLeadsResult.rows[0].count);

      // Get converted leads within the date range
      const convertedLeadsQuery = `
        SELECT COUNT(*) as count
        FROM leads
        WHERE assigned_to = $1 AND status = 'Converted' AND created_at >= $2
      `;
      const convertedLeadsResult = await pool.query(convertedLeadsQuery, [user.id, startDate]);
      const convertedLeads = parseInt(convertedLeadsResult.rows[0].count);

      // Calculate conversion rate
      const conversionRate = totalLeads > 0 ? ((convertedLeads / totalLeads) * 100).toFixed(2) : 0;

      // Add user performance to array
      salesPerformance.push({
        id: user.id,
        name: user.full_name,
        email: user.email,
        totalLeads,
        convertedLeads,
        conversionRate: parseFloat(conversionRate)
      });
    }

    // Return the sales performance report in the expected format
    res.status(200).json({
      data: salesPerformance
    });
  } catch (error) {
    console.error('Error fetching sales performance:', error);
    res.status(500).json({
      message: 'Error fetching sales performance',
      error: error.message
    });
  }
};

/**
 * Get lead aging report
 * @route   GET /lead-aging
 * @desc    Get lead aging distribution in time buckets
 * @access  Private
 */
const getLeadAging = async (req, res) => {
  try {
    const { roleId, userId } = req.user;

    // Check if user is admin or manager
    const isAdminOrManager = roleId === 1 || roleId === 2;

    // Get lead aging distribution
    const leadAgingQuery = `
      SELECT
        SUM(CASE WHEN age <= 1 THEN 1 ELSE 0 END) as "0-1_days",
        SUM(CASE WHEN age BETWEEN 2 AND 3 THEN 1 ELSE 0 END) as "2-3_days",
        SUM(CASE WHEN age BETWEEN 4 AND 7 THEN 1 ELSE 0 END) as "4-7_days",
        SUM(CASE WHEN age > 7 THEN 1 ELSE 0 END) as "7+_days"
      FROM (
        SELECT
          id,
          assigned_to,
          created_at,
          EXTRACT(DAYS FROM NOW() - created_at) as age
        FROM leads
        ${isAdminOrManager ? '' : 'WHERE assigned_to = $1'}
      ) as aged_leads
    `;
    const leadAgingParams = isAdminOrManager ? [] : [userId];

    const leadAgingResult = await pool.query(leadAgingQuery, leadAgingParams);
    const leadAgingData = leadAgingResult.rows[0];

    // Format the response
    const leadAging = {
      "0-1_days": parseInt(leadAgingData["0-1_days"]),
      "2-3_days": parseInt(leadAgingData["2-3_days"]),
      "4-7_days": parseInt(leadAgingData["4-7_days"]),
      "7+_days": parseInt(leadAgingData["7+_days"])
    };

    // Return the lead aging report
    res.status(200).json(leadAging);
  } catch (error) {
    console.error('Error fetching lead aging report:', error);
    res.status(500).json({
      message: 'Error fetching lead aging report',
      error: error.message
    });
  }
};

/**
 * Get conversion report
 * @route   GET /conversion-report
 * @desc    Get lead conversion funnel by status
 * @access  Private
 */
const getConversionReport = async (req, res) => {
  try {
    const { roleId, userId } = req.user;
    const { days, userId: selectedUserId } = req.query;

    // Check if user is admin or manager
    const isAdminOrManager = roleId === 1 || roleId === 2;

    // Build WHERE conditions
    const conditions = [];
    const params = [];
    let paramIndex = 1;

    // Add date range filter
    if (days) {
      conditions.push(`created_at >= NOW() - INTERVAL '${days} days'`);
    }

    // Add user filter (only for admin/manager)
    if (isAdminOrManager && selectedUserId) {
      conditions.push(`assigned_to = $${paramIndex++}`);
      params.push(selectedUserId);
    } else if (!isAdminOrManager) {
      // Sales users can only see their own leads
      conditions.push(`assigned_to = $${paramIndex++}`);
      params.push(userId);
    }

    // Build WHERE clause
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Get lead counts by status in funnel order
    const conversionQuery = `
      SELECT
        status,
        COUNT(*) as count
      FROM leads
      ${whereClause}
      GROUP BY status
      ORDER BY
        CASE
          WHEN status = 'New' THEN 1
          WHEN status = 'Contacted' THEN 2
          WHEN status = 'Qualified' THEN 3
          WHEN status = 'Converted' THEN 4
          ELSE 5
        END
    `;

    const conversionResult = await pool.query(conversionQuery, params);
    const conversionData = conversionResult.rows;

    // Format the response as a simple object with status as key
    const conversionReport = {};
    conversionData.forEach(item => {
      conversionReport[item.status] = parseInt(item.count);
    });

    // Return the conversion report
    res.status(200).json(conversionReport);
  } catch (error) {
    console.error('Error fetching conversion report:', error);
    res.status(500).json({
      message: 'Error fetching conversion report',
      error: error.message
    });
  }
};

/**
 * Export leads to CSV
 * @route   GET /export-leads-csv
 * @desc    Export leads data as CSV file with role-based filtering
 * @access  Private
 */
const exportLeadsCSV = async (req, res) => {
  try {
    const { roleId, userId } = req.user;

    // Check if user is admin or manager
    const isAdminOrManager = roleId === 1 || roleId === 2;

    // Check if route is admin/manager only
    const isAdminManagerOnly = req.path.includes('/export/leads');

    // If route is admin/manager only and user doesn't have required role
    if (isAdminManagerOnly && !isAdminOrManager) {
      return res.status(403).json({
        message: 'Access denied. Admin or Manager role required.'
      });
    }

    // Get leads with user details
    const leadsQuery = `
      SELECT
        l.id,
        l.full_name,
        l.mobile_number,
        l.email,
        l.status,
        l.created_at,
        u.full_name as assigned_to_name
      FROM leads l
      LEFT JOIN users u ON l.assigned_to = u.id
      ${isAdminOrManager ? '' : 'WHERE l.assigned_to = $1'}
      ORDER BY l.created_at DESC
    `;
    const leadsParams = isAdminOrManager ? [] : [userId];

    const leadsResult = await pool.query(leadsQuery, leadsParams);
    const leads = leadsResult.rows;

    // If no leads found
    if (leads.length === 0) {
      return res.status(404).json({
        message: 'No leads found'
      });
    }

    // Create export date in YYYY-MM-DD format
    const today = new Date();
    const exportDate = today.toISOString().split('T')[0];

    // Convert to CSV format
    const headers = ['ID', 'Full Name', 'Mobile Number', 'Email', 'Status', 'Created Date', 'Assigned Sales / Manager'];
    const csvRows = [];

    // Add metadata comment row at top
    csvRows.push(`# Exported By: ${req.user.email} | Export Date: ${exportDate}`);

    // Add headers
    csvRows.push(headers.join(','));

    // Add data rows
    leads.forEach(lead => {
      // Sanitize and trim values
      const sanitize = (value) => {
        if (!value) return '';
        return value.toString().trim().replace(/\n/g, ' ');
      };

      const row = [
        lead.id,
        `"${sanitize(lead.full_name)}"`,
        `"${sanitize(lead.mobile_number)}"`,
        `"${sanitize(lead.email)}"`,
        lead.status.charAt(0).toUpperCase() + lead.status.slice(1), // Capitalize first letter
        `"${new Date(lead.created_at).toISOString().split('T')[0]}"`, // Format as YYYY-MM-DD
        `"${sanitize(lead.assigned_to_name) || 'Unassigned'}"` // Handle null with "Unassigned"
      ];
      csvRows.push(row.join(','));
    });

    // Convert rows to CSV string
    const csvString = csvRows.join('');

    // Set response headers for file download
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=leads_export.csv');

    // Send CSV
    res.status(200).send(csvString);
  } catch (error) {
    console.error('Error exporting leads to CSV:', error);
    res.status(500).json({
      message: 'Error exporting leads to CSV',
      error: error.message
    });
  }
};

/**
 * Get leads over time data
 * @route   GET /leads-over-time
 * @desc    Get leads data grouped by time period (today, this week, this month)
 * @access  Private
 */
const getLeadsOverTime = async (req, res) => {
  try {
    const { roleId, userId } = req.user;
    const { period = 'month' } = req.query;

    // Base query conditions based on user role
    const isAdminOrManager = roleId === 1 || roleId === 2;
    const whereClause = isAdminOrManager ? '' : 'WHERE assigned_to = $1';
    const params = isAdminOrManager ? [] : [userId];

    let query = '';
    let result = [];

    switch (period) {
      case 'today':
        query = `
          SELECT 
            EXTRACT(HOUR FROM created_at) as hour,
            COUNT(*) as leads
          FROM leads
          ${whereClause}
          ${isAdminOrManager ? 'WHERE' : 'AND'} DATE(created_at) = CURRENT_DATE
          GROUP BY hour
          ORDER BY hour
        `;
        result = await pool.query(query, params);
        result = result.rows.map(row => ({
          time: `${row.hour}:00`,
          leads: parseInt(row.leads)
        }));
        break;

      case 'week':
        query = `
          SELECT 
            EXTRACT(DOW FROM created_at) as day_of_week,
            COUNT(*) as leads
          FROM leads
          ${whereClause}
          ${isAdminOrManager ? 'WHERE' : 'AND'} created_at >= DATE_TRUNC('week', CURRENT_DATE)
          GROUP BY day_of_week
          ORDER BY day_of_week
        `;
        result = await pool.query(query, params);
        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        result = result.rows.map(row => ({
          time: days[row.day_of_week],
          leads: parseInt(row.leads)
        }));
        break;

      case 'month':
      default:
        query = `
          SELECT 
            EXTRACT(WEEK FROM created_at) as week,
            COUNT(*) as leads
          FROM leads
          ${whereClause}
          ${isAdminOrManager ? 'WHERE' : 'AND'} DATE_TRUNC('month', created_at) = DATE_TRUNC('month', CURRENT_DATE)
          GROUP BY week
          ORDER BY week
        `;
        result = await pool.query(query, params);
        result = result.rows.map(row => ({
          time: `Week ${row.week}`,
          leads: parseInt(row.leads)
        }));
        break;
    }

    res.status(200).json(result);
  } catch (error) {
    console.error('Error fetching leads over time:', error);
    res.status(500).json({
      message: 'Error fetching leads over time',
      error: error.message
    });
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
