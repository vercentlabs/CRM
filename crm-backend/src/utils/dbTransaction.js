/**
 * PostgreSQL Transaction Helper Utility
 * 
 * This utility provides a standardized way to handle database transactions
 * using the pg library's Pool with client.connect().
 */

import pool from '../config/db.js';

/**
 * Executes a callback function within a database transaction
 * @param {Function} callback - Function that receives the client and performs operations
 * @returns {Promise} - Promise that resolves with the callback result or rejects with error
 */
const withTransaction = async (callback) => {
  // Get a client from the pool
  const client = await pool.connect();

  try {
    // Begin the transaction
    await client.query('BEGIN');

    // Execute the callback with the client
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

export {
  withTransaction
};
