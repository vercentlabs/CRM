import pool from '../config/db.js';
import { sendSuccess, sendError } from '../utils/response.js';

/**
 * Get system settings
 * @route   GET /settings
 * @desc    Get all system settings
 * @access  Private (Admin only)
 */
const getSettings = async (req, res) => {
  try {
    // Query the database for settings
    const query = 'SELECT * FROM settings ORDER BY key';
    const result = await pool.query(query);

    // Convert settings array to object
    const settings = {};
    result.rows.forEach(row => {
      settings[row.key] = row.value;
    });

    return sendSuccess(res, 'Settings retrieved successfully', { settings });
  } catch (error) {
    console.error('Error fetching settings:', error);
    return sendError(res, 'Failed to retrieve settings', 500, error.message);
  }
};

/**
 * Update system settings
 * @route   PATCH /settings
 * @desc    Update system settings
 * @access  Private (Admin only)
 */
const updateSettings = async (req, res) => {
  try {
    const { settings } = req.body;

    if (!settings || typeof settings !== 'object') {
      return sendError(res, 'Invalid settings data', 400);
    }

    // Begin transaction
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Update each setting
      for (const [key, value] of Object.entries(settings)) {
        const query = `
          INSERT INTO settings (key, value, updated_at)
          VALUES ($1, $2, NOW())
          ON CONFLICT (key) DO UPDATE
          SET value = $2, updated_at = NOW()
        `;
        await client.query(query, [key, JSON.stringify(value)]);
      }

      await client.query('COMMIT');

      // Return updated settings
      const result = await pool.query('SELECT * FROM settings ORDER BY key');
      const updatedSettings = {};
      result.rows.forEach(row => {
        updatedSettings[row.key] = row.value;
      });

      return sendSuccess(res, 'Settings updated successfully', { settings: updatedSettings });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error updating settings:', error);
    return sendError(res, 'Failed to update settings', 500, error.message);
  }
};

export { getSettings, updateSettings };
