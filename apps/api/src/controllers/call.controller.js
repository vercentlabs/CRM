import pool from '../config/db.js';
import { withTransaction } from '../utils/dbTransaction.js';
import { makeCall, generateCallXML } from '../services/plivo.service.js';

/**
 * Initiate a call for a lead
 * @route   POST /calls/initiate
 * @desc    Initiate a call for a lead
 * @access  Private
 */
const initiateCall = async (req, res) => {
  try {
    console.log('Initiate call request received:', req.body);
    const { leadId } = req.body;
    const { userId, roleId: role } = req.user;
    console.log('User info:', { userId, role });

    // Validate required field
    if (!leadId) {
      return res.status(400).json({
        message: 'Lead ID is required'
      });
    }

    // Check if lead exists
    const checkLeadQuery = 'SELECT id, assigned_to FROM leads WHERE id = $1';
    console.log('Checking lead:', leadId);
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

      if (role === 3) { // Sales - can only call their own leads
        if (lead.assigned_to !== userId) {
          return res.status(403).json({
            message: 'You can only initiate calls for leads assigned to you'
          });
        }
      }
      // For Manager (2) and Admin (1), no additional checks needed - they can call any lead

      // Get lead phone number
      const getLeadPhoneQuery = 'SELECT mobile_number, alternate_number FROM leads WHERE id = $1';
      pool.query(getLeadPhoneQuery, [leadId], async (error, phoneResults) => {
        if (error) {
          console.error('Error getting lead phone:', error);
          return res.status(500).json({
            message: 'Error getting lead phone number',
            error: error.message
          });
        }

        if (phoneResults.rows.length === 0) {
          return res.status(404).json({
            message: 'Lead not found'
          });
        }

        const leadPhone = phoneResults.rows[0]?.mobile_number || phoneResults.rows[0]?.alternate_number;
        if (!leadPhone) {
          return res.status(400).json({
            message: 'Lead does not have a phone number'
          });
        }

        // Insert call record
        const insertCallQuery = `
          INSERT INTO calls (lead_id, user_id, call_status, start_time)
          VALUES ($1, $2, 'Scheduled', NOW())
          RETURNING id
        `;

        console.log('Initiating call for lead:', leadId, 'user:', userId, 'phone:', leadPhone);
        pool.query(insertCallQuery, [leadId, userId], async (error, callResults) => {
          if (error) {
            console.error('Error inserting call:', error);
            return res.status(500).json({
              message: 'Error initiating call',
              error: error.message
            });
          }

          const callId = callResults.rows[0].id;

          try {
            // Make call using Plivo
            const plivoResponse = await makeCall(
              process.env.PLIVO_PHONE_NUMBER,
              leadPhone,
              `${process.env.PLIVO_WEBHOOK_URL}/answer`,
              {
                callId: callId,
                leadId: leadId,
                userId: userId
              }
            );

            // Update call record with Plivo call UUID
            const updateCallQuery = `
              UPDATE calls
              SET plivo_call_uuid = $1
              WHERE id = $2
            `;
            pool.query(updateCallQuery, [plivoResponse.callUuid, callId], (updateError) => {
              if (updateError) {
                console.error('Error updating call with Plivo UUID:', updateError);
              }
            });

            res.status(201).json({
              message: 'Call initiated successfully',
              callId: callId,
              plivoCallUuid: plivoResponse.callUuid
            });
          } catch (plivoError) {
            console.error('Error making Plivo call:', plivoError);
            // Update call status to Failed
            const updateCallStatusQuery = `
              UPDATE calls
              SET call_status = 'Cancelled', end_time = NOW()
              WHERE id = $1
            `;
            pool.query(updateCallStatusQuery, [callId], (updateError) => {
              if (updateError) {
                console.error('Error updating call status:', updateError);
              }
            });

            res.status(500).json({
              message: 'Error making call via Plivo',
              error: plivoError.message
            });
          }
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
 * End a call
 * @route   PUT /calls/:callId/end
 * @desc    End a call and update its details
 * @access  Private (Sales only)
 */
const endCall = async (req, res) => {
  try {
    const { id: callId } = req.params;
    const { duration_seconds, call_status, recording_url } = req.body;
    const { userId, roleId: role } = req.user;

    // Validate required field
    if (!callId) {
      return res.status(400).json({
        message: 'Call ID is required'
      });
    }

    // Only allow sales role
    if (role !== 3) {
      return res.status(403).json({
        message: 'Only sales users can end calls'
      });
    }

    // Use transaction helper for all related database operations
    const updatedFields = await withTransaction(async (client) => {
      // Check if call exists
      const checkCallQuery = 'SELECT id, user_id FROM calls WHERE id = $1 FOR UPDATE';
      const callResult = await client.query(checkCallQuery, [callId]);
      
      if (callResult.rows.length === 0) {
        throw new Error('Call not found');
      }

      // Check if call belongs to current user
      const call = callResult.rows[0];
      if (call.user_id !== userId) {
        throw new Error('You can only end calls that you initiated');
      }

      // Update call record
      const updateFields = [];
      const updateValues = [];
      let paramIndex = 1;

      if (duration_seconds !== undefined) {
        updateFields.push(`duration_seconds = $${paramIndex++}`);
        updateValues.push(duration_seconds);
      }

      // Always set call_status to Completed when ending a call
      updateFields.push(`call_status = $${paramIndex++}`);
      updateValues.push(call_status || 'Completed');

      if (recording_url !== undefined) {
        updateFields.push(`recording_url = $${paramIndex++}`);
        updateValues.push(recording_url);
      }

      // Always set end_time when ending a call
      updateFields.push(`end_time = $${paramIndex++}`);
      updateValues.push('NOW()');

      if (updateFields.length === 0) {
        throw new Error('No valid fields to update');
      }

      updateValues.push(callId);

      const updateCallQuery = `
        UPDATE calls
        SET ${updateFields.join(', ')}
        WHERE id = $${paramIndex}
      `;

      await client.query(updateCallQuery, updateValues);
      
      return updateFields.map(field => field.split(' = ')[0]);
    });
    
    res.status(200).json({
      message: 'Call ended successfully',
      callId,
      updatedFields
    });
  } catch (error) {
    // Handle specific errors
    if (error.message === 'Call not found') {
      return res.status(404).json({
        success: false,
        message: 'Call not found'
      });
    }
    
    if (error.message === 'You can only end calls that you initiated') {
      return res.status(403).json({
        success: false,
        message: 'You can only end calls that you initiated'
      });
    }
    
    if (error.message === 'No valid fields to update') {
      return res.status(400).json({
        success: false,
        message: 'No valid fields to update'
      });
    }
    
    // Generic error response
    res.status(500).json({
      success: false,
      message: 'Error updating call',
      error: error.message
    });
  }
};

/**
 * Get call logs
 * @route   GET /calls
 * @desc    Get call logs based on user role
 * @access  Private
 */
const getCallLogs = async (req, res) => {
  try {
    const { userId, roleId: role } = req.user;

    let query = `
      SELECT c.*, l.full_name as lead_name
      FROM calls c
      JOIN leads l ON c.lead_id = l.id
    `;

    let queryParams = [];

    // If role is sales, only return calls where user_id = userId
    if (role === 3) {
      query += ' WHERE c.user_id = $1';
      queryParams.push(userId);
    }

    // Order by start_time desc
    query += ' ORDER BY c.start_time DESC';

    pool.query(query, queryParams, (error, results) => {
      if (error) {
        return res.status(500).json({
          message: 'Error fetching call logs',
          error: error.message
        });
      }

      res.status(200).json({
        message: 'Call logs retrieved successfully',
        calls: results.rows
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
  initiateCall,
  endCall,
  getCallLogs
};
