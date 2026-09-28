import pool from '../config/db.js';
import { withTransaction } from '../utils/dbTransaction.js';
import { makeCall } from '../services/plivo.service.js';
import { parseId, scopeFor, serverError, tenantOf } from '../platform/tenancy.js';
import { isOwnLead } from './lead.controller.js';

/**
 * Initiate a call for a lead
 * @route   POST /calls/initiate
 * @access  crm.calls.create (own scope: only my leads)
 */
const initiateCall = async (req, res) => {
  try {
    const { organizationId, userId } = tenantOf(req);
    const leadId = parseId(req.body.leadId);

    if (!req.body.leadId) {
      return res.status(400).json({
        message: 'Lead ID is required'
      });
    }
    if (leadId === null) {
      return res.status(404).json({ message: 'Lead not found' });
    }

    const results = await pool.query(
      'SELECT id, assigned_to, created_by, mobile_number, alternate_number FROM leads WHERE id = $1 AND organization_id = $2',
      [leadId, organizationId]
    );
    if (results.rows.length === 0) {
      return res.status(404).json({
        message: 'Lead not found'
      });
    }

    const lead = results.rows[0];
    if (scopeFor(req, 'crm.calls.create') !== 'organization' && !isOwnLead(lead, userId)) {
      return res.status(403).json({
        message: 'You can only initiate calls for leads assigned to you'
      });
    }

    const leadPhone = lead.mobile_number || lead.alternate_number;
    if (!leadPhone) {
      return res.status(400).json({
        message: 'Lead does not have a phone number'
      });
    }

    const callResults = await pool.query(
      `INSERT INTO calls (organization_id, lead_id, user_id, call_status, start_time)
       VALUES ($1, $2, $3, 'Scheduled', NOW())
       RETURNING id`,
      [organizationId, leadId, userId]
    );
    const callId = callResults.rows[0].id;

    try {
      const plivoResponse = await makeCall(
        process.env.PLIVO_PHONE_NUMBER,
        leadPhone,
        `${process.env.PLIVO_WEBHOOK_URL}/answer`,
        {
          callId,
          leadId,
          userId
        }
      );

      await pool.query(
        'UPDATE calls SET plivo_call_uuid = $1 WHERE id = $2 AND organization_id = $3',
        [plivoResponse.callUuid, callId, organizationId]
      );

      res.status(201).json({
        message: 'Call initiated successfully',
        callId,
        plivoCallUuid: plivoResponse.callUuid
      });
    } catch (plivoError) {
      await pool
        .query(
          `UPDATE calls SET call_status = 'Cancelled', end_time = NOW() WHERE id = $1 AND organization_id = $2`,
          [callId, organizationId]
        )
        .catch(() => undefined);
      return serverError(res, 'Error making call via Plivo', plivoError);
    }
  } catch (error) {
    return serverError(res, 'Error initiating call', error);
  }
};

/**
 * End a call
 * @route   PUT /calls/:id/end
 * @access  crm.calls.update (own scope: only calls I initiated)
 */
const endCall = async (req, res) => {
  try {
    const { organizationId, userId } = tenantOf(req);
    const callId = parseId(req.params.id);
    const { duration_seconds, call_status, recording_url } = req.body;

    if (callId === null) {
      return res.status(404).json({ success: false, message: 'Call not found' });
    }

    const outcome = await withTransaction(async (client) => {
      const callResult = await client.query(
        'SELECT id, user_id FROM calls WHERE id = $1 AND organization_id = $2 FOR UPDATE',
        [callId, organizationId]
      );
      if (callResult.rows.length === 0) return { status: 404 };
      if (scopeFor(req, 'crm.calls.update') !== 'organization' && callResult.rows[0].user_id !== userId) {
        return { status: 403 };
      }

      const updateFields = [];
      const updateValues = [];
      const set = (column, value) => {
        updateValues.push(value);
        updateFields.push(`${column} = $${updateValues.length}`);
      };

      if (duration_seconds !== undefined) set('duration_seconds', duration_seconds);
      set('call_status', call_status || 'Completed');
      if (recording_url !== undefined) set('recording_url', recording_url);
      updateFields.push('end_time = NOW()');

      updateValues.push(callId, organizationId);
      await client.query(
        `UPDATE calls SET ${updateFields.join(', ')}
         WHERE id = $${updateValues.length - 1} AND organization_id = $${updateValues.length}`,
        updateValues
      );
      return { status: 200, updatedFields: updateFields.map((field) => field.split(' = ')[0]) };
    });

    if (outcome.status === 404) {
      return res.status(404).json({ success: false, message: 'Call not found' });
    }
    if (outcome.status === 403) {
      return res.status(403).json({ success: false, message: 'You can only end calls that you initiated' });
    }

    res.status(200).json({
      message: 'Call ended successfully',
      callId,
      updatedFields: outcome.updatedFields
    });
  } catch (error) {
    if (error.code === '23514') {
      return res.status(400).json({ success: false, message: 'Call data violates a validation rule' });
    }
    return serverError(res, 'Error updating call', error);
  }
};

/**
 * Get call logs
 * @route   GET /calls
 * @access  crm.calls.read (own scope: calls I made)
 */
const getCallLogs = async (req, res) => {
  try {
    const { organizationId, userId } = tenantOf(req);
    const params = [organizationId];
    let query = `
      SELECT c.*, l.full_name as lead_name
      FROM calls c
      JOIN leads l ON c.lead_id = l.id AND l.organization_id = c.organization_id
      WHERE c.organization_id = $1
    `;

    if (scopeFor(req, 'crm.calls.read') !== 'organization') {
      params.push(userId);
      query += ` AND c.user_id = $${params.length}`;
    }

    query += ' ORDER BY c.start_time DESC';
    const results = await pool.query(query, params);

    res.status(200).json({
      message: 'Call logs retrieved successfully',
      calls: results.rows
    });
  } catch (error) {
    return serverError(res, 'Error fetching call logs', error);
  }
};

export {
  initiateCall,
  endCall,
  getCallLogs
};
