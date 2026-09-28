import pool from '../config/db.js';

/**
 * Send a message to a lead
 * @route   POST /messages/send
 * @desc    Send a message to a lead
 * @access  Private
 */
const sendMessage = async (req, res) => {
  try {
    const { leadId, channel, content } = req.body;
    const { userId, roleId: role } = req.user;

    // Validate required fields
    if (!leadId || !channel || !content) {
      return res.status(400).json({
        message: 'Lead ID, channel, and message content are required'
      });
    }

    // Validate channel
    if (!['whatsapp', 'sms'].includes(channel)) {
      return res.status(400).json({
        message: 'Channel must be either "whatsapp" or "sms"'
      });
    }

    // Check if lead exists
    const checkLeadQuery = 'SELECT id, assigned_to FROM leads WHERE id = $1';
    pool.query(checkLeadQuery, [leadId], (error, results) => {
      if (error) {
        return res.status(500).json({
          message: 'Error checking lead',
          error: error.message
        });
      }

      if (results.rows.length === 0) {
        return res.status(404).json({
          message: 'Lead not found'
        });
      }

      // Check role-based permissions
      const lead = results.rows[0];

      if (role === 3) { // Sales - can only message their own leads
        if (lead.assigned_to !== userId) {
          return res.status(403).json({
            message: 'You can only send messages to leads assigned to you'
          });
        }
      }
      // For Manager (2) and Admin (1), no additional checks needed - they can message any lead

      // Insert message record
      const insertMessageQuery = `
        INSERT INTO messages (lead_id, user_id, message_type, content)
        VALUES ($1, $2, $3, $4)
        RETURNING id
      `;

      pool.query(insertMessageQuery, [leadId, userId, channel, content], (error, messageResults) => {
        if (error) {
          return res.status(500).json({
            message: 'Error sending message',
            error: error.message
          });
        }

        const messageId = messageResults.rows[0].id;

        res.status(201).json({
          message: 'Message sent successfully',
          messageId: messageId
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
 * Get messages
 * @route   GET /messages
 * @desc    Get messages based on user role
 * @access  Private
 */
const getMessages = async (req, res) => {
  try {
    const { userId, roleId: role } = req.user;

    let query = `
      SELECT m.*, l.full_name as lead_name
      FROM messages m
      JOIN leads l ON m.lead_id = l.id
    `;

    // If role is sales, only return messages where user_id = userId
    if (role === 3) {
      query += ` WHERE m.user_id = ${userId}`;
    }

    // Order by sent_at desc
    query += ' ORDER BY m.sent_at DESC';

    pool.query(query, (error, results) => {
      if (error) {
        return res.status(500).json({
          message: 'Error fetching messages',
          error: error.message
        });
      }

      res.status(200).json({
        message: 'Messages retrieved successfully',
        messages: results.rows
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
 * Update message status
 * @route   PUT /messages/:messageId/status
 * @desc    Update message delivery status
 * @access  Public (for webhook use)
 */
const updateMessageStatus = async (req, res) => {
  try {
    const { id: messageId } = req.params;
    const { status } = req.body;

    // Validate status
    const validStatuses = ['Sent', 'Delivered', 'Failed'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        message: 'Invalid status. Must be one of: Sent, Delivered, Failed'
      });
    }

    // Update message status
    const updateQuery = `
      UPDATE messages
      SET status = $1
      WHERE id = $2
      RETURNING id
    `;

    pool.query(updateQuery, [status, messageId], (error, results) => {
      if (error) {
        return res.status(500).json({
          message: 'Error updating message status',
          error: error.message
        });
      }

      if (results.rows.length === 0) {
        return res.status(404).json({
          message: 'Message not found'
        });
      }

      res.status(200).json({
        message: 'Message status updated successfully',
        messageId: results.rows[0].id,
        status: status
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
 * Send bulk messages to multiple leads
 * @route   POST /messages/bulk
 * @desc    Send messages to multiple leads
 * @access  Private
 */
const sendBulkMessage = async (req, res) => {
  try {
    const { leadIds, channel, content } = req.body;
    const { userId, roleId } = req.user;

    // Validate required fields
    if (!leadIds || !Array.isArray(leadIds) || leadIds.length === 0 || !channel || !content) {
      return res.status(400).json({
        message: 'Lead IDs array, channel, and message text are required'
      });
    }

    // Validate channel
    if (!['whatsapp', 'sms'].includes(channel)) {
      return res.status(400).json({
        message: 'Channel must be either "whatsapp" or "sms"'
      });
    }

    // Process leads based on role
    if (roleId === 3) { // Sales role - check lead ownership
      for (const leadId of leadIds) {
        const checkLeadQuery = 'SELECT id FROM leads WHERE id = $1 AND assigned_to = $2';
        const leadResult = await new Promise((resolve, reject) => {
          pool.query(checkLeadQuery, [leadId, userId], (error, results) => {
            if (error) reject(error);
            else resolve(results);
          });
        });

        if (leadResult.rows.length === 0) {
          // Check if the lead exists at all
          const existsQuery = 'SELECT id FROM leads WHERE id = $1';
          const existsResult = await new Promise((resolve, reject) => {
            pool.query(existsQuery, [leadId], (error, results) => {
              if (error) reject(error);
              else resolve(results);
            });
          });

          if (existsResult.rows.length === 0) {
            return res.status(404).json({
              message: `Lead with ID ${leadId} not found`
            });
          } else {
            // Lead exists but is not assigned to this user
            return res.status(403).json({
              message: "You can only bulk message leads assigned to you"
            });
          }
        }
      }
    }
    // For Manager (2) and Admin (1), no additional checks needed - they can message any lead

    // Insert messages for all leads
    let successCount = 0;
    const insertPromises = leadIds.map(leadId => {
      return new Promise((resolve, reject) => {
        const insertMessageQuery = `
          INSERT INTO messages (lead_id, user_id, message_type, content, status)
          VALUES ($1, $2, $3, $4, 'Sent')
          RETURNING id
        `;

        pool.query(insertMessageQuery, [leadId, userId, channel, content], (error, results) => {
          if (error) {
            reject(error);
          } else {
            successCount++;
            resolve(results.rows[0].id);
          }
        });
      });
    });

    try {
      await Promise.all(insertPromises);

      res.status(201).json({
        message: "Bulk messages queued",
        count: successCount
      });
    } catch (error) {
      res.status(500).json({
        message: 'Error sending bulk messages',
        error: error.message
      });
    }
  } catch (error) {
    res.status(500).json({
      message: 'Server error',
      error: error.message
    });
  }
};

export {
  sendMessage,
  getMessages,
  updateMessageStatus,
  sendBulkMessage
};