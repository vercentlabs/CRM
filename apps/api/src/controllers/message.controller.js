import pool from '../config/db.js';
import { parseId, scopeFor, serverError, tenantOf } from '../platform/tenancy.js';
import { OWN_LEAD } from './lead.controller.js';

/**
 * Lead messaging (serves both /messages and /api/lead-messages).
 * API channels are lowercase; the messages_type_check constraint stores
 * 'SMS' / 'WhatsApp' (the pre-Phase-2 code inserted lowercase and always failed).
 */
const CHANNEL_TO_TYPE = { sms: 'SMS', whatsapp: 'WhatsApp' };

const validateMessageInput = (body, { bulk }) => {
  const { channel, content } = body;
  if (bulk) {
    if (!Array.isArray(body.leadIds) || body.leadIds.length === 0 || !channel || !content) {
      return 'Lead IDs array, channel, and message text are required';
    }
  } else if (!body.leadId || !channel || !content) {
    return 'Lead ID, channel, and message content are required';
  }
  if (!CHANNEL_TO_TYPE[channel]) return 'Channel must be either "whatsapp" or "sms"';
  return null;
};

/**
 * Returns the ids from `leadIds` that exist in the organization and are
 * within the caller's messaging scope.
 */
const visibleLeadIds = async (req, leadIds) => {
  const { organizationId, userId } = tenantOf(req);
  const ids = [...new Set(leadIds.map(parseId).filter((id) => id !== null))];
  if (ids.length === 0) return [];
  const params = [organizationId, ids];
  let query = 'SELECT l.id FROM leads l WHERE l.organization_id = $1 AND l.id = ANY($2::int[])';
  if (scopeFor(req, 'crm.messages.send') !== 'organization') {
    params.push(userId);
    query += ` AND ${OWN_LEAD('l', '$3')}`;
  }
  const result = await pool.query(query, params);
  return result.rows.map((row) => row.id);
};

/**
 * @route   POST /messages/send, POST /api/lead-messages/send
 * @access  crm.messages.send (own scope: only my leads)
 */
const sendMessage = async (req, res) => {
  try {
    const { organizationId, userId } = tenantOf(req);
    const invalid = validateMessageInput(req.body, { bulk: false });
    if (invalid) return res.status(400).json({ message: invalid });

    const [leadId] = await visibleLeadIds(req, [req.body.leadId]);
    if (!leadId) {
      // Same response for "does not exist", "other organization" and "not yours".
      return res.status(404).json({ message: 'Lead not found' });
    }

    const result = await pool.query(
      `INSERT INTO messages (organization_id, lead_id, user_id, message_type, content)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [organizationId, leadId, userId, CHANNEL_TO_TYPE[req.body.channel], req.body.content]
    );

    res.status(201).json({
      message: 'Message sent successfully',
      messageId: result.rows[0].id
    });
  } catch (error) {
    return serverError(res, 'Error sending message', error);
  }
};

/**
 * @route   GET /messages, GET /api/lead-messages
 * @access  crm.messages.read (own scope: messages I sent)
 */
const getMessages = async (req, res) => {
  try {
    const { organizationId, userId } = tenantOf(req);
    const params = [organizationId];
    let query = `
      SELECT m.*, l.full_name as lead_name
      FROM messages m
      JOIN leads l ON m.lead_id = l.id AND l.organization_id = m.organization_id
      WHERE m.organization_id = $1
    `;

    if (scopeFor(req, 'crm.messages.read') !== 'organization') {
      params.push(userId);
      query += ` AND m.user_id = $${params.length}`;
    }

    query += ' ORDER BY m.sent_at DESC';
    const results = await pool.query(query, params);

    res.status(200).json({
      message: 'Messages retrieved successfully',
      messages: results.rows
    });
  } catch (error) {
    return serverError(res, 'Error fetching messages', error);
  }
};

/**
 * @route   PUT /messages/:id/status, PUT /api/lead-messages/:id/status
 * @access  crm.messages.update (own scope: messages I sent)
 */
const updateMessageStatus = async (req, res) => {
  try {
    const { organizationId, userId } = tenantOf(req);
    const messageId = parseId(req.params.id);
    const { status } = req.body;

    const validStatuses = ['Sent', 'Delivered', 'Failed'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        message: 'Invalid status. Must be one of: Sent, Delivered, Failed'
      });
    }
    if (messageId === null) return res.status(404).json({ message: 'Message not found' });

    const params = [status, messageId, organizationId];
    let query = 'UPDATE messages SET status = $1 WHERE id = $2 AND organization_id = $3';
    if (scopeFor(req, 'crm.messages.update') !== 'organization') {
      params.push(userId);
      query += ' AND user_id = $4';
    }
    const results = await pool.query(`${query} RETURNING id`, params);

    if (results.rows.length === 0) {
      return res.status(404).json({
        message: 'Message not found'
      });
    }

    res.status(200).json({
      message: 'Message status updated successfully',
      messageId: results.rows[0].id,
      status
    });
  } catch (error) {
    return serverError(res, 'Error updating message status', error);
  }
};

/**
 * @route   POST /messages/bulk, POST /api/lead-messages/bulk
 * @access  crm.messages.send (every lead must be visible to the caller)
 */
const sendBulkMessage = async (req, res) => {
  try {
    const { organizationId, userId } = tenantOf(req);
    const invalid = validateMessageInput(req.body, { bulk: true });
    if (invalid) return res.status(400).json({ message: invalid });

    const requested = [...new Set(req.body.leadIds.map(parseId))];
    const visible = await visibleLeadIds(req, requested);
    if (requested.includes(null) || visible.length !== requested.length) {
      // All-or-nothing, without revealing which ids exist in other organizations.
      return res.status(404).json({ message: 'One or more leads were not found' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const leadId of visible) {
        await client.query(
          `INSERT INTO messages (organization_id, lead_id, user_id, message_type, content, status)
           VALUES ($1, $2, $3, $4, $5, 'Sent')`,
          [organizationId, leadId, userId, CHANNEL_TO_TYPE[req.body.channel], req.body.content]
        );
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }

    res.status(201).json({
      message: 'Bulk messages queued',
      count: visible.length
    });
  } catch (error) {
    return serverError(res, 'Error sending bulk messages', error);
  }
};

export {
  sendMessage,
  getMessages,
  updateMessageStatus,
  sendBulkMessage
};
