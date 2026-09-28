import pool from '../config/db.js';

/**
 * Get all conversations for the current user
 * @route   GET /api/chat/conversations
 * @desc    Get all conversations for the logged-in user
 * @access  Private
 */
const getConversations = async (req, res) => {
  try {
    const userId = req.user.userId;

    const query = `
      SELECT
        c.id,
        c.name,
        c.is_group,
        c.created_at,
        c.updated_at,
        cp.last_read_at,
        cm.content as last_message,
        cm.created_at as last_message_time,
        cm.sender_id as last_message_sender_id,
        u.full_name as last_message_sender_name,
        u.username as last_message_sender_username,
        u.role_id as last_message_sender_role_id,
        COALESCE(unread_counts.unread_count, 0) as unread_count,
        COALESCE(
          json_agg(DISTINCT jsonb_build_object(
            'user_id', cp.user_id,
            'is_online', cp.is_online,
            'full_name', u2.full_name,
            'username', u2.username,
            'role_id', u2.role_id
          )) FILTER (WHERE cp.user_id IS NOT NULL),
          '[]'::json
        ) as participants
      FROM chat_conversations c
      JOIN chat_participants cp ON c.id = cp.conversation_id
      LEFT JOIN users u2 ON cp.user_id = u2.id
      LEFT JOIN chat_messages cm ON c.id = cm.conversation_id AND cm.id = (
        SELECT MAX(id) FROM chat_messages WHERE conversation_id = c.id
      )
      LEFT JOIN users u ON cm.sender_id = u.id
      LEFT JOIN (
        SELECT
          conversation_id,
          COUNT(*) as unread_count
        FROM chat_messages
        WHERE is_read = false AND sender_id != $1
        GROUP BY conversation_id
      ) unread_counts ON c.id = unread_counts.conversation_id
      WHERE cp.user_id = $1
      GROUP BY c.id, c.name, c.is_group, c.created_at, c.updated_at, cp.last_read_at, 
               cm.content, cm.created_at, cm.sender_id, u.full_name, u.username, u.role_id, u2.full_name, u2.username, u2.role_id, 
               unread_counts.unread_count
      ORDER BY c.updated_at DESC
    `;

    pool.query(query, [userId], (error, results) => {
      if (error) {
        return res.status(500).json({
          message: 'Error fetching conversations',
          error: error.message
        });
      }

      res.status(200).json({
        message: 'Conversations retrieved successfully',
        conversations: results.rows
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
 * Get messages for a specific conversation
 * @route   GET /api/chat/conversations/:conversationId/messages
 * @desc    Get all messages for a conversation
 * @access  Private
 */
const getMessages = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { conversationId } = req.params;

    // Check if user is a participant in the conversation
    const checkParticipantQuery = `
      SELECT id FROM chat_participants
      WHERE conversation_id = $1 AND user_id = $2
    `;

    pool.query(checkParticipantQuery, [conversationId, userId], (error, participantResults) => {
      if (error) {
        return res.status(500).json({
          message: 'Error checking conversation access',
          error: error.message
        });
      }

      if (participantResults.rows.length === 0) {
        return res.status(403).json({
          message: 'You are not a participant in this conversation'
        });
      }

      // Get messages
      const messagesQuery = `
        SELECT
          cm.*,
          u.full_name as sender_name,
          u.username as sender_username,
          u.role_id as sender_role_id
        FROM chat_messages cm
        JOIN users u ON cm.sender_id = u.id
        WHERE cm.conversation_id = $1
        ORDER BY cm.created_at ASC
      `;

      pool.query(messagesQuery, [conversationId], (error, messageResults) => {
        if (error) {
          return res.status(500).json({
            message: 'Error fetching messages',
            error: error.message
          });
        }

        // Update last_read_at for the participant
        const updateReadQuery = `
          UPDATE chat_participants
          SET last_read_at = CURRENT_TIMESTAMP
          WHERE conversation_id = $1 AND user_id = $2
        `;

        pool.query(updateReadQuery, [conversationId, userId]);

        res.status(200).json({
          message: 'Messages retrieved successfully',
          messages: messageResults.rows
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
 * Create a new conversation
 * @route   POST /api/chat/conversations
 * @desc    Create a new conversation
 * @access  Private
 */
const createConversation = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { name, isGroup, participantIds } = req.body;

    if (!participantIds || !Array.isArray(participantIds)) {
      return res.status(400).json({
        message: 'Participant IDs are required'
      });
    }

    // For group chats, name is required
    if (isGroup && !name) {
      return res.status(400).json({
        message: 'Group name is required'
      });
    }

    // Add current user to participants
    const allParticipantIds = [...new Set([userId, ...participantIds])];

    // Auto-generate name for direct chats if not provided
    let conversationName = name;
    if (!isGroup && !name) {
      // Get the participant's name from the database
      const userQuery = `
        SELECT full_name, username
        FROM users
        WHERE id = $1
      `;
      const userResult = await new Promise((resolve, reject) => {
        pool.query(userQuery, [participantIds[0]], (error, results) => {
          if (error) reject(error);
          else resolve(results);
        });
      });
      
      if (userResult.rows.length > 0) {
        conversationName = userResult.rows[0].full_name || userResult.rows[0].username || 'Unknown';
      } else {
        conversationName = 'Unknown';
      }
    }

    // Check for existing direct chat (non-group)
    if (!isGroup && allParticipantIds.length === 2) {
      const checkExistingQuery = `
        SELECT c.id, c.name
        FROM chat_conversations c
        JOIN chat_participants p1 ON c.id = p1.conversation_id
        JOIN chat_participants p2 ON c.id = p2.conversation_id
        WHERE c.is_group = false
          AND p1.user_id = $1
          AND p2.user_id = $2
          AND c.id IN (
            SELECT conversation_id
            FROM chat_participants
            WHERE user_id IN ($1, $2)
            GROUP BY conversation_id
            HAVING COUNT(DISTINCT user_id) = 2
          )
        LIMIT 1
      `;

      const existingResult = await new Promise((resolve, reject) => {
        pool.query(checkExistingQuery, [allParticipantIds[0], allParticipantIds[1]], (error, results) => {
          if (error) reject(error);
          else resolve(results);
        });
      });

      if (existingResult.rows.length > 0) {
        return res.status(400).json({
          message: `A conversation already exists with this user`,
          existingConversation: existingResult.rows[0]
        });
      }
    }

    // Create conversation
    const createConversationQuery = `
      INSERT INTO chat_conversations (name, is_group, created_by)
      VALUES ($1, $2, $3)
      RETURNING id
    `;

    pool.query(createConversationQuery, [conversationName, isGroup || false, userId], (error, conversationResults) => {
      if (error) {
        return res.status(500).json({
          message: 'Error creating conversation',
          error: error.message
        });
      }

      const conversationId = conversationResults.rows[0].id;

      // Add participants
      const participantValues = allParticipantIds.map((pid, index) => `($1, $${index + 2})`).join(', ');
      const addParticipantsQuery = `
        INSERT INTO chat_participants (conversation_id, user_id)
        VALUES ${participantValues}
      `;

      pool.query(addParticipantsQuery, [conversationId, ...allParticipantIds], (error) => {
        if (error) {
          return res.status(500).json({
            message: 'Error adding participants',
            error: error.message
          });
        }

        res.status(201).json({
          message: 'Conversation created successfully',
          conversationId
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
 * Send a message to a conversation
 * @route   POST /api/chat/conversations/:conversationId/messages
 * @desc    Send a message to a conversation
 * @access  Private
 */
const sendMessage = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { conversationId } = req.params;
    const { content, messageType, attachmentUrl, fileType } = req.body;

    if (!content) {
      return res.status(400).json({
        message: 'Message content is required'
      });
    }

    // Check if user is a participant in the conversation
    const checkParticipantQuery = `
      SELECT id FROM chat_participants
      WHERE conversation_id = $1 AND user_id = $2
    `;

    pool.query(checkParticipantQuery, [conversationId, userId], (error, participantResults) => {
      if (error) {
        return res.status(500).json({
          message: 'Error checking conversation access',
          error: error.message
        });
      }

      if (participantResults.rows.length === 0) {
        return res.status(403).json({
          message: 'You are not a participant in this conversation'
        });
      }

      // Insert message
      const insertMessageQuery = `
        INSERT INTO chat_messages (conversation_id, sender_id, content, message_type, attachment_url, file_type)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `;

      pool.query(
        insertMessageQuery,
        [conversationId, userId, content, messageType || 'text', attachmentUrl || null, fileType || null],
        (error, messageResults) => {
          if (error) {
            return res.status(500).json({
              message: 'Error sending message',
              error: error.message
            });
          }

          const message = messageResults.rows[0];

          // Mark messages as read for the sender
          const updateReadQuery = `
            UPDATE chat_participants
            SET last_read_at = CURRENT_TIMESTAMP
            WHERE conversation_id = $1 AND user_id = $2
          `;

          pool.query(updateReadQuery, [conversationId, userId]);

          // Get sender information
          const senderQuery = `
            SELECT full_name, username, role_id
            FROM users
            WHERE id = $1
          `;

          pool.query(senderQuery, [userId], (error, senderResults) => {
            if (error) {
              console.error('Error fetching sender info:', error);
            }

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
          });
        }
      );
    });
  } catch (error) {
    res.status(500).json({
      message: 'Server error',
      error: error.message
    });
  }
};

/**
 * Mark messages as read
 * @route   PUT /api/chat/conversations/:conversationId/read
 * @desc    Mark all messages in conversation as read
 * @access  Private
 */
const markAsRead = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { conversationId } = req.params;

    // Update the last_read_at timestamp for the participant
    const updateParticipantQuery = `
      UPDATE chat_participants
      SET last_read_at = CURRENT_TIMESTAMP
      WHERE conversation_id = $1 AND user_id = $2
      RETURNING id
    `;

    // Mark all unread messages as read
    const updateMessagesQuery = `
      UPDATE chat_messages
      SET is_read = true
      WHERE conversation_id = $1
        AND sender_id != $2
        AND is_read = false
    `;

    pool.query(updateParticipantQuery, [conversationId, userId], (error, results) => {
      if (error) {
        return res.status(500).json({
          message: 'Error marking messages as read',
          error: error.message
        });
      }

      if (results.rows.length === 0) {
        return res.status(404).json({
          message: 'Conversation not found'
        });
      }

      // Mark messages as read
      pool.query(updateMessagesQuery, [conversationId, userId], (msgError) => {
        if (msgError) {
          console.error('Error updating messages as read:', msgError);
          // Continue even if marking messages fails, as participant was updated
        }

        res.status(200).json({
          message: 'Messages marked as read successfully'
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
 * Update online status
 * @route   PUT /api/chat/online-status
 * @desc    Update user's online status
 * @access  Private
 */
const updateOnlineStatus = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { isOnline } = req.body;

    if (typeof isOnline !== 'boolean') {
      return res.status(400).json({
        message: 'isOnline must be a boolean'
      });
    }

    const updateQuery = `
      UPDATE chat_participants
      SET is_online = $1
      WHERE user_id = $2
      RETURNING conversation_id
    `;

    pool.query(updateQuery, [!isOnline, userId], (error, results) => {
      if (error) {
        return res.status(500).json({
          message: 'Error updating online status',
          error: error.message
        });
      }

      res.status(200).json({
        message: 'Online status updated successfully',
        conversations: results.rows.map(row => row.conversation_id)
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
 * Get conversation participants with their details
 * @route   GET /api/chat/conversations/:conversationId/participants
 * @desc    Get all participants in a conversation
 * @access  Private
 */
const getConversationParticipants = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { conversationId } = req.params;

    // Check if user is a participant in the conversation
    const checkParticipantQuery = `
      SELECT id FROM chat_participants
      WHERE conversation_id = $1 AND user_id = $2
    `;

    pool.query(checkParticipantQuery, [conversationId, userId], (error, participantResults) => {
      if (error) {
        return res.status(500).json({
          message: 'Error checking conversation access',
          error: error.message
        });
      }

      if (participantResults.rows.length === 0) {
        return res.status(403).json({
          message: 'You are not a participant in this conversation'
        });
      }

      // Get all participants with their details
      const participantsQuery = `
        SELECT
          cp.user_id,
          cp.is_online,
          cp.last_read_at,
          u.full_name,
          u.username,
          u.role_id
        FROM chat_participants cp
        JOIN users u ON cp.user_id = u.id
        WHERE cp.conversation_id = $1
        ORDER BY u.full_name ASC
      `;

      pool.query(participantsQuery, [conversationId], (error, results) => {
        if (error) {
          return res.status(500).json({
            message: 'Error fetching participants',
            error: error.message
          });
        }

        res.status(200).json({
          message: 'Participants retrieved successfully',
          participants: results.rows
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
  getConversations,
  getMessages,
  createConversation,
  sendMessage,
  markAsRead,
  updateOnlineStatus,
  getConversationParticipants
};
