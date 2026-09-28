import pool from '../config/db.js';
import { logAuditEvent } from '../utils/auditLogger.js';

/**
 * Get followups based on user role
 * @route   GET /followups
 * @desc    Get leads with next_call_at dates based on user role
 * @access  Private
 */
const getFollowups = async (req, res) => {
  try {
    const { userId, roleId: role } = req.user;
    let query = `
      SELECT 
        l.id as lead_id,
        l.full_name as name,
        l.email,
        l.mobile_number,
        l.status,
        l.next_call_at,
        l.assigned_to,
        u.full_name as assigned_to_name,
        u.id as assigned_to_id
      FROM leads l
      LEFT JOIN users u ON l.assigned_to = u.id
      WHERE l.next_call_at IS NOT NULL
    `;

    let queryParams = [];

    // Role-based filtering
    if (role === 3) { // Sales - only their own leads
      query += ' AND l.assigned_to = $1';
      queryParams.push(userId);
    }
    // For Manager (2) and Admin (1), no additional WHERE clause needed - they can see all leads

    // Order by next_call_at
    query += ' ORDER BY l.next_call_at ASC';

    pool.query(query, queryParams, (error, results) => {
      if (error) {
        return res.status(500).json({
          message: 'Error retrieving followups',
          error: error.message
        });
      }

      // Transform results to match frontend expectations
      const followups = results.rows.map(row => ({
        id: row.lead_id, // Use lead_id as the followup id
        lead_id: row.lead_id,
        assignedTo: {
          id: row.assigned_to_id,
          name: row.assigned_to_name
        },
        followup_date: row.next_call_at,
        scheduled_at: row.next_call_at,
        followup_type: 'Call', // Default to Call
        notes: '',
        status: 'Pending',
        completed: false,
        lead: {
          id: row.lead_id,
          name: row.name,
          email: row.email,
          mobile_number: row.mobile_number,
          status: row.status,
          next_call_at: row.next_call_at
        }
      }));

      res.status(200).json({
        message: 'Followups retrieved successfully',
        followups
      });
    });
  } catch (error) {
    res.status(500).json({
      message: 'Server error',
      error: error.message
    });
  }
};

/**
 * Get overdue followups based on user role
 * @route   GET /followups/overdue
 * @desc    Get leads with overdue next_call_at dates based on user role
 * @access  Private
 */
const getOverdueFollowups = async (req, res) => {
  try {
    const { userId, roleId: role } = req.user;
    let query = `
      SELECT 
        l.id as lead_id,
        l.full_name as name,
        l.email,
        l.mobile_number,
        l.status,
        l.next_call_at,
        l.assigned_to,
        u.full_name as assigned_to_name,
        u.id as assigned_to_id
      FROM leads l
      LEFT JOIN users u ON l.assigned_to = u.id
      WHERE l.next_call_at IS NOT NULL AND l.next_call_at < NOW()
    `;

    let queryParams = [];

    // Role-based filtering
    if (role === 3) { // Sales - only their own leads
      query += ' AND l.assigned_to = $1';
      queryParams.push(userId);
    }
    // For Manager (2) and Admin (1), no additional WHERE clause needed - they can see all overdue leads
    // Order by next_call_at (oldest first)
    query += ' ORDER BY l.next_call_at ASC';

    pool.query(query, queryParams, (error, results) => {
      if (error) {
        return res.status(500).json({
          message: 'Error retrieving overdue followups',
          error: error.message
        });
      }

      // Transform results to match frontend expectations
      const followups = results.rows.map(row => ({
        id: row.lead_id, // Use lead_id as the followup id
        lead_id: row.lead_id,
        assignedTo: {
          id: row.assigned_to_id,
          name: row.assigned_to_name
        },
        followup_date: row.next_call_at,
        scheduled_at: row.next_call_at,
        followup_type: 'Call', // Default to Call
        notes: '',
        status: 'Pending',
        completed: false,
        lead: {
          id: row.lead_id,
          name: row.name,
          email: row.email,
          mobile_number: row.mobile_number,
          status: row.status,
          next_call_at: row.next_call_at
        }
      }));

      res.status(200).json({
        message: 'Overdue followups retrieved successfully',
        followups
      });
    });
  } catch (error) {
    res.status(500).json({
      message: 'Server error',
      error: error.message
    });
  }
};

/**
 * Complete a followup
 * @route   PATCH /followups/:id/complete
 * @desc    Mark a followup as completed
 * @access  Private (Sales only)
 */
const completeFollowup = async (req, res) => {
  try {
    const { userId, roleId: role } = req.user;
    const { id: followupId } = req.params;

    // Only sales users can complete followups
    if (role !== 3) {
      return res.status(403).json({
        message: 'Only sales users can complete followups'
      });
    }

    // First check if the followup exists and belongs to the user
    const checkQuery = 'SELECT assigned_to, lead_id, followup_date FROM followups WHERE id = $1';
    pool.query(checkQuery, [followupId], (checkError, checkResults) => {
      if (checkError) {
        return res.status(500).json({
          message: 'Error checking followup',
          error: checkError.message
        });
      }

      if (checkResults.rows.length === 0) {
        return res.status(404).json({
          message: 'Followup not found'
        });
      }

      // Check if the followup belongs to the user
      if (checkResults.rows[0].assigned_to !== userId) {
        return res.status(403).json({
          message: 'You can only complete your own followups'
        });
      }

      // Store followup details for audit logging
      const followupDetails = checkResults.rows[0];

      // Update the followup as completed
      const updateQuery = "UPDATE followups SET status = 'Completed', completed_at = NOW() WHERE id = $1";
      pool.query(updateQuery, [followupId], async (updateError, updateResults) => {
        if (updateError) {
          return res.status(500).json({
            message: 'Error completing followup',
            error: updateError.message
          });
        }

        // Log follow-up completion
        try {
          await logAuditEvent(
            userId,
            'COMPLETE_FOLLOWUP',
            'followup',
            followupId,
            {
              lead_id: followupDetails.lead_id,
              followup_date: followupDetails.followup_date,
              completed_at: new Date().toISOString(),
              completed_by: userId
            }
          );
        } catch (logError) {
          console.error('Error logging followup completion:', logError);
          // Continue with response even if logging fails
        }

        res.status(200).json({
          message: 'Followup completed successfully'
        });
      });
    });
  } catch (error) {
    res.status(500).json({
      message: 'Server error',
      error: error.message
    });
  }
};

/**
 * Mark a followup as overdue
 * @route   PATCH /followups/:id/overdue
 * @desc    Mark a followup as overdue
 * @access  Private (Sales only)
 */
const markFollowupOverdue = async (req, res) => {
  try {
    const { userId, roleId: role } = req.user;
    const { id: followupId } = req.params;

    // Only sales users can mark followups as overdue
    if (role !== 3) {
      return res.status(403).json({
        message: 'Only sales users can mark followups as overdue'
      });
    }

    // First check if the followup exists and belongs to the user
    const checkQuery = 'SELECT assigned_to, lead_id, followup_date FROM followups WHERE id = $1';
    pool.query(checkQuery, [followupId], (checkError, checkResults) => {
      if (checkError) {
        return res.status(500).json({
          message: 'Error checking followup',
          error: checkError.message
        });
      }

      if (checkResults.rows.length === 0) {
        return res.status(404).json({
          message: 'Followup not found'
        });
      }

      // Check if the followup belongs to the user
      if (checkResults.rows[0].assigned_to !== userId) {
        return res.status(403).json({
          message: 'You can only mark your own followups as overdue'
        });
      }

      // Store followup details for audit logging
      const followupDetails = checkResults.rows[0];

      // Update the followup as overdue
      const updateQuery = "UPDATE followups SET status = 'Overdue', completed_at = NOW() WHERE id = $1";
      pool.query(updateQuery, [followupId], async (updateError, updateResults) => {
        if (updateError) {
          return res.status(500).json({
            message: 'Error marking followup as overdue',
            error: updateError.message
          });
        }

        // Log follow-up overdue marking
        try {
          await logAuditEvent(
            userId,
            'MARK_FOLLOWUP_OVERDUE',
            'followup',
            followupId,
            {
              lead_id: followupDetails.lead_id,
              followup_date: followupDetails.followup_date,
              marked_overdue_at: new Date().toISOString(),
              marked_overdue_by: userId
            }
          );
        } catch (logError) {
          console.error('Error logging followup overdue marking:', logError);
          // Continue with response even if logging fails
        }

        res.status(200).json({
          message: 'Followup marked as overdue successfully'
        });
      });
    });
  } catch (error) {
    res.status(500).json({
      message: 'Server error',
      error: error.message
    });
  }
};

export {
  getFollowups,
  getOverdueFollowups,
  completeFollowup,
  markFollowupOverdue
};
