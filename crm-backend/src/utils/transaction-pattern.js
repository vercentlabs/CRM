/**
 * Standard PostgreSQL Transaction Pattern using pg Pool
 * 
 * This file contains a reference implementation for database transactions
 * using the pg library's Pool with client.connect().
 * 
 * IMPORTANT: This is a reference pattern only and should NOT be applied
 * to any endpoint yet. It's provided as a commented code example
 * for future implementation.
 */

import pool from '../config/db.js';

/**
 * Example of a standard transaction pattern for multiple database operations
 * 
 * @param {Function} callback - Function that receives the client and performs operations
 * @returns {Promise} - Promise that resolves with the callback result or rejects with error
 */
const withTransaction = async (callback) => {
  // Begin transaction
  const client = await pool.connect();

  try {
    // Begin the transaction
    await client.query('BEGIN');

    // Execute the callback with the client, allowing it to perform operations
    const result = await callback(client);

    // If all operations succeed, commit the transaction
    await client.query('COMMIT');

    // Return the result from the callback
    return result;
  } catch (error) {
    // If any operation fails, roll back the transaction
    await client.query('ROLLBACK');

    // Re-throw the error for the caller to handle
    throw error;
  } finally {
    // Always release the client back to the pool
    client.release();
  }
};

/**
 * Example usage pattern for a createFollowup operation
 * 
 * This is commented out as it's only a reference example
 */
/*
const createFollowupWithTransaction = async (req, res) => {
  try {
    const { leadId, scheduled_at } = req.body;
    const { userId } = req.user;

    // Use the transaction helper
    const result = await withTransaction(async (client) => {
      // First, verify the lead exists and user has permission
      const leadCheckQuery = 'SELECT id, assigned_to FROM leads WHERE id = $1';
      const leadResult = await client.query(leadCheckQuery, [leadId]);

      if (leadResult.rows.length === 0) {
        throw new Error('Lead not found');
      }

      if (leadResult.rows[0].assigned_to !== userId) {
        throw new Error('You can only create followups for leads assigned to you');
      }

      // Insert the followup
      const insertFollowupQuery = `
        INSERT INTO followups (lead_id, user_id, scheduled_at)
        VALUES ($1, $2, $3)
        RETURNING id
      `;
      const followupResult = await client.query(insertFollowupQuery, [leadId, userId, scheduled_at]);

      // Update the lead's next_call_at
      const updateLeadQuery = 'UPDATE leads SET next_call_at = $1 WHERE id = $2';
      await client.query(updateLeadQuery, [scheduled_at, leadId]);

      // Return the followup ID
      return followupResult.rows[0].id;
    });

    // Send success response
    res.status(201).json({
      success: true,
      message: 'Followup created successfully',
      followupId: result
    });
  } catch (error) {
    // Handle errors
    console.error('Error creating followup:', error);

    // Send appropriate error response based on the error
    if (error.message === 'Lead not found') {
      return res.status(404).json({
        success: false,
        message: 'Lead not found'
      });
    }

    if (error.message === 'You can only create followups for leads assigned to you') {
      return res.status(403).json({
        success: false,
        message: error.message
      });
    }

    // Generic error response
    res.status(500).json({
      success: false,
      message: 'Error creating followup',
      error: error.message
    });
  }
};
*/

/**
 * Alternative pattern with more granular error handling
 * 
 * This is commented out as it's only a reference example
 */
/*
const complexTransactionExample = async (req, res) => {
  const client = await pool.connect();

  try {
    // Begin the transaction
    await client.query('BEGIN');

    // Perform multiple related operations
    const { leadId, userId, data } = req.body;

    // Operation 1: Check if lead exists
    const leadResult = await client.query(
      'SELECT id, assigned_to FROM leads WHERE id = $1 FOR UPDATE', 
      [leadId]
    );

    if (leadResult.rows.length === 0) {
      throw new Error('Lead not found');
    }

    // Operation 2: Check permissions
    if (leadResult.rows[0].assigned_to !== userId) {
      throw new Error('Permission denied');
    }

    // Operation 3: Create a followup
    const followupResult = await client.query(
      'INSERT INTO followups (lead_id, user_id, scheduled_at) VALUES ($1, $2, $3) RETURNING id',
      [leadId, userId, data.scheduled_at]
    );

    // Operation 4: Update the lead
    await client.query(
      'UPDATE leads SET next_call_at = $1, status = $2 WHERE id = $3',
      [data.scheduled_at, 'contacted', leadId]
    );

    // Operation 5: Log the activity
    await client.query(
      'INSERT INTO activity_logs (lead_id, user_id, activity_type, details) VALUES ($1, $2, $3, $4)',
      [leadId, userId, 'followup_created', JSON.stringify(data)]
    );

    // If all operations succeed, commit the transaction
    await client.query('COMMIT');

    // Send success response
    res.status(201).json({
      success: true,
      message: 'Followup created successfully',
      followupId: followupResult.rows[0].id
    });

  } catch (error) {
    // If any operation fails, roll back the transaction
    await client.query('ROLLBACK');

    // Handle errors
    console.error('Error in transaction:', error);

    // Send appropriate error response
    if (error.message === 'Lead not found') {
      return res.status(404).json({
        success: false,
        message: 'Lead not found'
      });
    }

    if (error.message === 'Permission denied') {
      return res.status(403).json({
        success: false,
        message: 'You can only create followups for leads assigned to you'
      });
    }

    // Generic error response
    res.status(500).json({
      success: false,
      message: 'Error creating followup',
      error: error.message
    });

  } finally {
    // Always release the client back to the pool
    client.release();
  }
};
*/

module.exports = {
  withTransaction
  // Export the helper function for use in other files
  // Note: The example functions are commented out and should not be used directly
};
