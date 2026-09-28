import pool from '../config/db.js';
import { sendSuccess, sendError } from '../utils/response.js';
import { logAuditEvent } from '../utils/auditLogger.js';
import { serverError, tenantOf } from '../platform/tenancy.js';

/**
 * Organization settings: customer-editable, one namespace per organization.
 * Platform configuration lives in environment variables, never in this table.
 */
const MAX_SETTINGS = 100;
const KEY_PATTERN = /^[a-z][a-z0-9_]{0,99}$/;

const readSettings = async (organizationId) => {
  const result = await pool.query('SELECT key, value FROM settings WHERE organization_id = $1 ORDER BY key', [
    organizationId
  ]);
  const settings = {};
  result.rows.forEach((row) => {
    settings[row.key] = row.value;
  });
  return settings;
};

/**
 * @route   GET /settings
 * @access  settings.organization.manage
 */
const getSettings = async (req, res) => {
  try {
    const { organizationId } = tenantOf(req);
    return sendSuccess(res, 'Settings retrieved successfully', { settings: await readSettings(organizationId) });
  } catch (error) {
    return serverError(res, 'Failed to retrieve settings', error);
  }
};

/**
 * @route   PATCH /settings
 * @access  settings.organization.manage
 */
const updateSettings = async (req, res) => {
  try {
    const { organizationId, userId } = tenantOf(req);
    const { settings } = req.body;

    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
      return sendError(res, 'Invalid settings data', 400);
    }
    const entries = Object.entries(settings);
    if (entries.length > MAX_SETTINGS || entries.some(([key]) => !KEY_PATTERN.test(key))) {
      return sendError(res, 'Invalid settings data', 400);
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const [key, value] of entries) {
        await client.query(
          `INSERT INTO settings (organization_id, key, value, updated_at)
           VALUES ($1, $2, $3, NOW())
           ON CONFLICT (organization_id, key) DO UPDATE
           SET value = EXCLUDED.value, updated_at = NOW()`,
          [organizationId, key, JSON.stringify(value)]
        );
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    await logAuditEvent(userId, 'UPDATE_SETTINGS', 'settings', null, null, { keys: entries.map(([key]) => key) });

    return sendSuccess(res, 'Settings updated successfully', { settings: await readSettings(organizationId) });
  } catch (error) {
    return serverError(res, 'Failed to update settings', error);
  }
};

export { getSettings, updateSettings };
