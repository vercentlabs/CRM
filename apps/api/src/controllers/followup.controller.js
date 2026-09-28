import pool from '../config/db.js';
import { logAuditEvent } from '../utils/auditLogger.js';
import { parseId, scopeFor, serverError, tenantOf } from '../platform/tenancy.js';

const toFollowupView = (row) => ({
  id: row.lead_id, // Use lead_id as the followup id (historical UI contract)
  lead_id: row.lead_id,
  assignedTo: {
    id: row.assigned_to_id,
    name: row.assigned_to_name
  },
  followup_date: row.next_call_at,
  scheduled_at: row.next_call_at,
  followup_type: 'Call',
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
});

const listLeadFollowups = async (req, res, { overdueOnly }) => {
  const { organizationId, userId } = tenantOf(req);
  const params = [organizationId];
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
    WHERE l.organization_id = $1 AND l.next_call_at IS NOT NULL
  `;

  if (overdueOnly) query += ' AND l.next_call_at < NOW()';

  // Own scope: only follow-ups on leads assigned to me
  if (scopeFor(req, 'crm.followups.read') !== 'organization') {
    params.push(userId);
    query += ` AND l.assigned_to = $${params.length}`;
  }

  query += ' ORDER BY l.next_call_at ASC';
  const results = await pool.query(query, params);
  return results.rows.map(toFollowupView);
};

/**
 * @route   GET /followups
 * @access  crm.followups.read
 */
const getFollowups = async (req, res) => {
  try {
    const followups = await listLeadFollowups(req, res, { overdueOnly: false });
    res.status(200).json({
      message: 'Followups retrieved successfully',
      followups
    });
  } catch (error) {
    return serverError(res, 'Error retrieving followups', error);
  }
};

/**
 * @route   GET /followups/overdue
 * @access  crm.followups.read
 */
const getOverdueFollowups = async (req, res) => {
  try {
    const followups = await listLeadFollowups(req, res, { overdueOnly: true });
    res.status(200).json({
      message: 'Overdue followups retrieved successfully',
      followups
    });
  } catch (error) {
    return serverError(res, 'Error retrieving overdue followups', error);
  }
};

const updateFollowupStatus = async (req, res, { status, action, message, forbiddenMessage }) => {
  const { organizationId, userId } = tenantOf(req);
  const followupId = parseId(req.params.id);
  if (followupId === null) {
    return res.status(404).json({ message: 'Followup not found' });
  }

  const checkResults = await pool.query(
    'SELECT assigned_to, lead_id, followup_date FROM followups WHERE id = $1 AND organization_id = $2',
    [followupId, organizationId]
  );

  if (checkResults.rows.length === 0) {
    return res.status(404).json({ message: 'Followup not found' });
  }

  const followupDetails = checkResults.rows[0];
  if (scopeFor(req, 'crm.followups.update') !== 'organization' && followupDetails.assigned_to !== userId) {
    return res.status(403).json({ message: forbiddenMessage });
  }

  try {
    await pool.query(
      'UPDATE followups SET status = $1, completed_at = NOW() WHERE id = $2 AND organization_id = $3',
      [status, followupId, organizationId]
    );
  } catch (error) {
    if (error.code === '23514') {
      return res.status(400).json({ message: `Followup cannot be marked as ${status}` });
    }
    throw error;
  }

  await logAuditEvent(userId, action, 'followups', followupId, null, {
    lead_id: followupDetails.lead_id,
    followup_date: followupDetails.followup_date,
    status,
    changed_by: userId
  });

  return res.status(200).json({ message });
};

/**
 * @route   PATCH /followups/:id/complete
 * @access  crm.followups.update (own scope: only follow-ups assigned to me)
 */
const completeFollowup = async (req, res) => {
  try {
    return await updateFollowupStatus(req, res, {
      status: 'Completed',
      action: 'COMPLETE_FOLLOWUP',
      message: 'Followup completed successfully',
      forbiddenMessage: 'You can only complete your own followups'
    });
  } catch (error) {
    return serverError(res, 'Error completing followup', error);
  }
};

/**
 * @route   PATCH /followups/:id/overdue
 * @access  crm.followups.update (own scope: only follow-ups assigned to me)
 */
const markFollowupOverdue = async (req, res) => {
  try {
    return await updateFollowupStatus(req, res, {
      status: 'Overdue',
      action: 'MARK_FOLLOWUP_OVERDUE',
      message: 'Followup marked as overdue successfully',
      forbiddenMessage: 'You can only mark your own followups as overdue'
    });
  } catch (error) {
    return serverError(res, 'Error marking followup as overdue', error);
  }
};

export {
  getFollowups,
  getOverdueFollowups,
  completeFollowup,
  markFollowupOverdue
};
