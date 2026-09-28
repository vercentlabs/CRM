import pool from '../config/db.js';

/**
 * Logs an audit event to the audit_logs table
 * @param {number} userId - ID of the user performing the action
 * @param {string} action - Description of the action performed
 * @param {string} tableName - Name of the table where action was performed
 * @param {string} recordId - ID of the record that was acted upon
 * @param {Object} oldValues - Previous values before the update (optional)
 * @param {Object} newValues - New values after the update (optional)
 * @param {string} ipAddress - IP address of the user (optional)
 * @param {string} userAgent - User agent string of the browser/client (optional)
 * @returns {Promise<Object>} - The created audit log record
 */
const logAuditEvent = async (userId, action, tableName, recordId, oldValues = null, newValues = null, ipAddress = null, userAgent = null) => {
  try {
    // Convert values to JSON string if provided
    const oldValuesJson = oldValues ? JSON.stringify(oldValues) : null;
    const newValuesJson = newValues ? JSON.stringify(newValues) : null;

    // Build the query dynamically based on what parameters are provided
    const fields = ['user_id', 'action', 'table_name', 'record_id'];
    const values = [userId, action, tableName, recordId];
    let paramCount = 4;

    // Add old_values if provided
    if (oldValuesJson) {
      fields.push('old_values');
      values.push(oldValuesJson);
      paramCount++;
    }

    // Add new_values if provided
    if (newValuesJson) {
      fields.push('new_values');
      values.push(newValuesJson);
      paramCount++;
    }

    // Add ip_address if provided
    if (ipAddress) {
      fields.push('ip_address');
      values.push(ipAddress);
      paramCount++;
    }

    // Add user_agent if provided
    if (userAgent) {
      fields.push('user_agent');
      values.push(userAgent);
      paramCount++;
    }

    // Add timestamp
    fields.push('created_at');
    values.push('NOW()');

    // Build the query
    const placeholders = [];
    for (let i = 1; i <= fields.length; i++) {
      placeholders.push(`$${i}`);
    }

    const query = `
      INSERT INTO audit_logs (
        ${fields.join(', ')}
      )
      VALUES (
        ${placeholders.join(', ')}
      )
      RETURNING *
    `;

    const result = await pool.query(query, values);
    return result.rows[0];
  } catch (error) {
    console.error('Error logging audit event:', error);
    // Return null or throw error based on requirements
    // For now, we'll just log the error and return null
    return null;
  }
};

export {
  logAuditEvent
};
