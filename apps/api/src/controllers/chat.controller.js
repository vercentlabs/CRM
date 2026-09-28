import pool from '../config/db.js';
import { filterActiveMembers, parseId, serverError, tenantOf } from '../platform/tenancy.js';

/**
 * Internal team chat. Conversations belong to one organization; participants
 * and messages derive their tenant from the conversation. A conversation is
 * visible only inside its organization AND only to its participants.
 * `role_id` in responses is the member's role in this organization (legacy id,
 * display only).
 */

const MEMBER_ROLE_JOIN = (userAlias, orgExpr, alias) => `
  LEFT JOIN organization_memberships ${alias}_m ON ${alias}_m.user_id = ${userAlias}.id AND ${alias}_m.organization_id = ${orgExpr}
  LEFT JOIN roles ${alias}_r ON ${alias}_r.id = ${alias}_m.role_id`;

/** Conversation id when it exists in the organization and the caller participates; otherwise null. */
const accessibleConversation = async (req) => {
  const { organizationId, userId } = tenantOf(req);
  const conversationId = parseId(req.params.conversationId);
  if (conversationId === null) return null;
  const result = await pool.query(
    `SELECT c.id FROM chat_conversations c
     JOIN chat_participants p ON p.conversation_id = c.id AND p.user_id = $3
     WHERE c.id = $1 AND c.organization_id = $2`,
    [conversationId, organizationId, userId]
  );
  return result.rows[0]?.id ?? null;
};

const NOT_FOUND = { message: 'Conversation not found' };

/**
 * @route   GET /api/chat/conversations
 * @access  crm.chat.use
 */
const getConversations = async (req, res) => {
  try {
    const { organizationId, userId } = tenantOf(req);
    const query = `
      SELECT
        c.id,
        c.name,
        c.is_group,
        c.created_at,
        c.updated_at,
        me.last_read_at,
        cm.content as last_message,
        cm.created_at as last_message_time,
        cm.sender_id as last_message_sender_id,
        su.full_name as last_message_sender_name,
        su.username as last_message_sender_username,
        s_r.legacy_role_id as last_message_sender_role_id,
        COALESCE(unread_counts.unread_count, 0) as unread_count,
        COALESCE(
          (SELECT json_agg(jsonb_build_object(
             'user_id', cp.user_id,
             'is_online', cp.is_online,
             'full_name', pu.full_name,
             'username', pu.username,
             'role_id', p_r.legacy_role_id
           ))
           FROM chat_participants cp
           JOIN users pu ON pu.id = cp.user_id
           ${MEMBER_ROLE_JOIN('pu', 'c.organization_id', 'p')}
           WHERE cp.conversation_id = c.id),
          '[]'::json
        ) as participants
      FROM chat_conversations c
      JOIN chat_participants me ON me.conversation_id = c.id AND me.user_id = $2
      LEFT JOIN chat_messages cm ON cm.id = (
        SELECT MAX(id) FROM chat_messages WHERE conversation_id = c.id
      )
      LEFT JOIN users su ON cm.sender_id = su.id
      ${MEMBER_ROLE_JOIN('su', 'c.organization_id', 's')}
      LEFT JOIN (
        SELECT conversation_id, COUNT(*) as unread_count
        FROM chat_messages
        WHERE is_read = false AND sender_id != $2
        GROUP BY conversation_id
      ) unread_counts ON c.id = unread_counts.conversation_id
      WHERE c.organization_id = $1
      ORDER BY c.updated_at DESC
    `;

    const results = await pool.query(query, [organizationId, userId]);
    res.status(200).json({
      message: 'Conversations retrieved successfully',
      conversations: results.rows
    });
  } catch (error) {
    return serverError(res, 'Error fetching conversations', error);
  }
};

/**
 * @route   GET /api/chat/conversations/:conversationId/messages
 * @access  crm.chat.use (participants only)
 */
const getMessages = async (req, res) => {
  try {
    const { organizationId, userId } = tenantOf(req);
    const conversationId = await accessibleConversation(req);
    if (!conversationId) return res.status(404).json(NOT_FOUND);

    const messageResults = await pool.query(
      `SELECT cm.*, u.full_name as sender_name, u.username as sender_username,
              s_r.legacy_role_id as sender_role_id
       FROM chat_messages cm
       JOIN users u ON cm.sender_id = u.id
       ${MEMBER_ROLE_JOIN('u', '$2', 's')}
       WHERE cm.conversation_id = $1
       ORDER BY cm.created_at ASC`,
      [conversationId, organizationId]
    );

    await pool.query(
      'UPDATE chat_participants SET last_read_at = CURRENT_TIMESTAMP WHERE conversation_id = $1 AND user_id = $2',
      [conversationId, userId]
    );

    res.status(200).json({
      message: 'Messages retrieved successfully',
      messages: messageResults.rows
    });
  } catch (error) {
    return serverError(res, 'Error fetching messages', error);
  }
};

/**
 * @route   POST /api/chat/conversations
 * @access  crm.chat.use; every participant must be an active member of the organization
 */
const createConversation = async (req, res) => {
  try {
    const { organizationId, userId } = tenantOf(req);
    const { name, isGroup, participantIds } = req.body;

    if (!participantIds || !Array.isArray(participantIds)) {
      return res.status(400).json({
        message: 'Participant IDs are required'
      });
    }

    if (isGroup && !name) {
      return res.status(400).json({
        message: 'Group name is required'
      });
    }

    const requested = [...new Set(participantIds.map(parseId))];
    const members = await filterActiveMembers(organizationId, requested);
    if (requested.includes(null) || members.length !== requested.length) {
      // Same answer for unknown users and users of other organizations.
      return res.status(400).json({ message: 'One or more participants are not members of this organization' });
    }

    const allParticipantIds = [...new Set([userId, ...members])];

    let conversationName = name;
    if (!isGroup && !name) {
      const userResult = await pool.query('SELECT full_name, username FROM users WHERE id = $1', [members[0]]);
      conversationName = userResult.rows[0]?.full_name || userResult.rows[0]?.username || 'Unknown';
    }

    if (!isGroup && allParticipantIds.length === 2) {
      const existingResult = await pool.query(
        `SELECT c.id, c.name
         FROM chat_conversations c
         WHERE c.organization_id = $1 AND c.is_group = false
           AND c.id IN (
             SELECT conversation_id FROM chat_participants
             GROUP BY conversation_id
             HAVING COUNT(*) = 2
                AND bool_and(user_id = ANY($2::int[]))
           )
         LIMIT 1`,
        [organizationId, allParticipantIds]
      );

      if (existingResult.rows.length > 0) {
        return res.status(400).json({
          message: 'A conversation already exists with this user',
          existingConversation: existingResult.rows[0]
        });
      }
    }

    const client = await pool.connect();
    let conversationId;
    try {
      await client.query('BEGIN');
      const conversationResults = await client.query(
        `INSERT INTO chat_conversations (organization_id, name, is_group, created_by)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [organizationId, conversationName, isGroup || false, userId]
      );
      conversationId = conversationResults.rows[0].id;
      await client.query(
        `INSERT INTO chat_participants (conversation_id, user_id)
         SELECT $1, unnest($2::int[])`,
        [conversationId, allParticipantIds]
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }

    res.status(201).json({
      message: 'Conversation created successfully',
      conversationId
    });
  } catch (error) {
    return serverError(res, 'Error creating conversation', error);
  }
};

/**
 * @route   POST /api/chat/conversations/:conversationId/messages
 * @access  crm.chat.use (participants only)
 */
const sendMessage = async (req, res) => {
  try {
    const { organizationId, userId } = tenantOf(req);
    const { content, messageType, attachmentUrl, fileType } = req.body;

    if (!content) {
      return res.status(400).json({
        message: 'Message content is required'
      });
    }

    const conversationId = await accessibleConversation(req);
    if (!conversationId) return res.status(404).json(NOT_FOUND);

    const messageResults = await pool.query(
      `INSERT INTO chat_messages (conversation_id, sender_id, content, message_type, attachment_url, file_type)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [conversationId, userId, content, messageType || 'text', attachmentUrl || null, fileType || null]
    );
    const message = messageResults.rows[0];

    await pool.query(
      'UPDATE chat_participants SET last_read_at = CURRENT_TIMESTAMP WHERE conversation_id = $1 AND user_id = $2',
      [conversationId, userId]
    );

    const senderResults = await pool.query(
      `SELECT u.full_name, u.username, s_r.legacy_role_id AS role_id
       FROM users u ${MEMBER_ROLE_JOIN('u', '$2', 's')}
       WHERE u.id = $1`,
      [userId, organizationId]
    );
    const sender = senderResults.rows[0] || {};

    res.status(201).json({
      message: 'Message sent successfully',
      data: {
        id: message.id,
        conversation_id: message.conversation_id,
        sender_id: message.sender_id,
        sender_name: sender.full_name,
        sender_username: sender.username,
        sender_role_id: sender.role_id,
        content: message.content,
        message_type: message.message_type,
        attachment_url: message.attachment_url,
        created_at: message.created_at
      }
    });
  } catch (error) {
    return serverError(res, 'Error sending message', error);
  }
};

/**
 * @route   PUT /api/chat/conversations/:conversationId/read
 * @access  crm.chat.use (participants only)
 */
const markAsRead = async (req, res) => {
  try {
    const { userId } = tenantOf(req);
    const conversationId = await accessibleConversation(req);
    if (!conversationId) return res.status(404).json(NOT_FOUND);

    await pool.query(
      'UPDATE chat_participants SET last_read_at = CURRENT_TIMESTAMP WHERE conversation_id = $1 AND user_id = $2',
      [conversationId, userId]
    );
    await pool.query(
      `UPDATE chat_messages SET is_read = true
       WHERE conversation_id = $1 AND sender_id != $2 AND is_read = false`,
      [conversationId, userId]
    );

    res.status(200).json({
      message: 'Messages marked as read successfully'
    });
  } catch (error) {
    return serverError(res, 'Error marking messages as read', error);
  }
};

/**
 * Online status for the caller's conversations in the active organization.
 * @route   PUT /api/chat/online-status
 * @access  crm.chat.use
 */
const updateOnlineStatus = async (req, res) => {
  try {
    const { organizationId, userId } = tenantOf(req);
    const { isOnline } = req.body;

    if (typeof isOnline !== 'boolean') {
      return res.status(400).json({
        message: 'isOnline must be a boolean'
      });
    }

    // NOTE: the stored flag is inverted relative to the request; this
    // pre-Phase-2 behaviour is kept because the clients compensate for it.
    const results = await pool.query(
      `UPDATE chat_participants p SET is_online = $1
       FROM chat_conversations c
       WHERE c.id = p.conversation_id AND c.organization_id = $3 AND p.user_id = $2
       RETURNING p.conversation_id`,
      [!isOnline, userId, organizationId]
    );

    res.status(200).json({
      message: 'Online status updated successfully',
      conversations: results.rows.map((row) => row.conversation_id)
    });
  } catch (error) {
    return serverError(res, 'Error updating online status', error);
  }
};

/**
 * @route   GET /api/chat/conversations/:conversationId/participants
 * @access  crm.chat.use (participants only)
 */
const getConversationParticipants = async (req, res) => {
  try {
    const { organizationId } = tenantOf(req);
    const conversationId = await accessibleConversation(req);
    if (!conversationId) return res.status(404).json(NOT_FOUND);

    const results = await pool.query(
      `SELECT cp.user_id, cp.is_online, cp.last_read_at, u.full_name, u.username,
              p_r.legacy_role_id AS role_id
       FROM chat_participants cp
       JOIN users u ON cp.user_id = u.id
       ${MEMBER_ROLE_JOIN('u', '$2', 'p')}
       WHERE cp.conversation_id = $1
       ORDER BY u.full_name ASC`,
      [conversationId, organizationId]
    );

    res.status(200).json({
      message: 'Participants retrieved successfully',
      participants: results.rows
    });
  } catch (error) {
    return serverError(res, 'Error fetching participants', error);
  }
};

export {
  getConversations,
  getMessages,
  createConversation,
  sendMessage,
  markAsRead,
  updateOnlineStatus,
  getConversationParticipants
};
