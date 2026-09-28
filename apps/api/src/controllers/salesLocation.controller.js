/**
 * Sales Location Controller
 *
 * Sales locations and executive check-ins are organization-owned. Route
 * middleware enforces crm.locations.* permissions; every query here is bounded
 * by the verified organization.
 */

import pool from '../config/db.js';
import { logAuditEvent } from '../utils/auditLogger.js';
import { isActiveMember, parseId, serverError, tenantOf } from '../platform/tenancy.js';

const validManager = async (organizationId, managerId) =>
  managerId === null || (await isActiveMember(organizationId, managerId));

/**
 * @route   GET /sales-locations
 * @access  crm.locations.read
 */
const getSalesLocations = async (req, res) => {
  try {
    const { organizationId } = tenantOf(req);
    const results = await pool.query(
      `SELECT sl.*, u.full_name
       FROM sales_locations sl
       LEFT JOIN users u ON sl.manager_id = u.id
       WHERE sl.organization_id = $1
       ORDER BY sl.name`,
      [organizationId]
    );

    res.status(200).json({
      success: true,
      count: results.rows.length,
      locations: results.rows
    });
  } catch (error) {
    return serverError(res, 'Error retrieving sales locations', error);
  }
};

/**
 * @route   POST /sales-locations
 * @access  crm.locations.manage
 */
const createSalesLocation = async (req, res) => {
  try {
    const { organizationId, userId } = tenantOf(req);
    const {
      name,
      address,
      city,
      state,
      country = 'India',
      pin_code,
      contact_phone,
      manager_id
    } = req.body;

    if (!name) {
      return res.status(400).json({
        success: false,
        message: 'Location name is required'
      });
    }

    const managerId = manager_id ? parseId(manager_id) : null;
    if ((manager_id && managerId === null) || !(await validManager(organizationId, managerId))) {
      return res.status(400).json({ success: false, message: 'Manager is not a member of this organization' });
    }

    const results = await pool.query(
      `INSERT INTO sales_locations (
         organization_id, name, address, city, state, country, pin_code, contact_phone, manager_id
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [organizationId, name, address || null, city || null, state || null, country, pin_code || null, contact_phone || null, managerId]
    );

    await logAuditEvent(userId, 'CREATE_SALES_LOCATION', 'sales_locations', results.rows[0].id, null, {
      name,
      manager_id: managerId
    });

    res.status(201).json({
      success: true,
      message: 'Sales location created successfully',
      location: results.rows[0]
    });
  } catch (error) {
    return serverError(res, 'Error creating sales location', error);
  }
};

/**
 * @route   PUT /sales-locations/:id
 * @access  crm.locations.manage
 */
const updateSalesLocation = async (req, res) => {
  try {
    const { organizationId, userId } = tenantOf(req);
    const locationId = parseId(req.params.id);
    const { name, address, city, state, country, pin_code, contact_phone, manager_id } = req.body;

    if (locationId === null) {
      return res.status(404).json({ success: false, message: 'Sales location not found' });
    }

    const checkResult = await pool.query(
      'SELECT * FROM sales_locations WHERE id = $1 AND organization_id = $2',
      [locationId, organizationId]
    );
    if (checkResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Sales location not found'
      });
    }
    const oldValues = checkResult.rows[0];

    const updateFields = [];
    const updateValues = [];
    const set = (column, value) => {
      updateValues.push(value);
      updateFields.push(`${column} = $${updateValues.length}`);
    };

    if (name !== undefined) set('name', name);
    if (address !== undefined) set('address', address);
    if (city !== undefined) set('city', city);
    if (state !== undefined) set('state', state);
    if (country !== undefined) set('country', country);
    if (pin_code !== undefined) set('pin_code', pin_code);
    if (contact_phone !== undefined) set('contact_phone', contact_phone);
    if (manager_id !== undefined) {
      const managerId = manager_id === null || manager_id === '' ? null : parseId(manager_id);
      if ((manager_id && managerId === null) || !(await validManager(organizationId, managerId))) {
        return res.status(400).json({ success: false, message: 'Manager is not a member of this organization' });
      }
      set('manager_id', managerId);
    }

    if (updateFields.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid fields to update'
      });
    }

    updateValues.push(locationId, organizationId);
    const results = await pool.query(
      `UPDATE sales_locations SET ${updateFields.join(', ')}
       WHERE id = $${updateValues.length - 1} AND organization_id = $${updateValues.length}
       RETURNING *`,
      updateValues
    );

    await logAuditEvent(userId, 'UPDATE_SALES_LOCATION', 'sales_locations', locationId, oldValues, results.rows[0]);

    res.status(200).json({
      success: true,
      message: 'Sales location updated successfully',
      location: results.rows[0]
    });
  } catch (error) {
    return serverError(res, 'Error updating sales location', error);
  }
};

/**
 * @route   DELETE /sales-locations/:id
 * @access  crm.locations.manage
 */
const deleteSalesLocation = async (req, res) => {
  try {
    const { organizationId, userId } = tenantOf(req);
    const locationId = parseId(req.params.id);
    if (locationId === null) {
      return res.status(404).json({ success: false, message: 'Sales location not found' });
    }

    const checkResult = await pool.query(
      'SELECT * FROM sales_locations WHERE id = $1 AND organization_id = $2',
      [locationId, organizationId]
    );
    if (checkResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Sales location not found'
      });
    }

    const leadsCheckResult = await pool.query(
      'SELECT COUNT(*) FROM leads WHERE location_id = $1 AND organization_id = $2',
      [locationId, organizationId]
    );
    if (parseInt(leadsCheckResult.rows[0].count) > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete sales location. It is referenced by one or more leads.'
      });
    }

    await pool.query('DELETE FROM sales_locations WHERE id = $1 AND organization_id = $2', [locationId, organizationId]);

    await logAuditEvent(userId, 'DELETE_SALES_LOCATION', 'sales_locations', locationId, checkResult.rows[0], null);

    res.status(200).json({
      success: true,
      message: 'Sales location deleted successfully'
    });
  } catch (error) {
    return serverError(res, 'Error deleting sales location', error);
  }
};

/**
 * Report the caller's current location (one row per member per organization)
 * @route   POST /sales-locations/update-location
 * @access  crm.locations.checkin
 */
const updateSalesExecutiveLocation = async (req, res) => {
  try {
    const { organizationId, userId } = tenantOf(req);
    const { latitude, longitude, address } = req.body;

    if (!latitude || !longitude) {
      return res.status(400).json({
        success: false,
        message: 'Latitude and longitude are required'
      });
    }

    const results = await pool.query(
      `INSERT INTO user_locations (organization_id, user_id, latitude, longitude, address)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (organization_id, user_id) DO UPDATE
         SET latitude = EXCLUDED.latitude, longitude = EXCLUDED.longitude,
             address = EXCLUDED.address, updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [organizationId, userId, latitude, longitude, address || null]
    );

    res.status(200).json({
      success: true,
      message: 'Location updated successfully',
      location: results.rows[0]
    });
  } catch (error) {
    if (error.code === '22003' || error.code === '22P02') {
      return res.status(400).json({ success: false, message: 'Invalid coordinates' });
    }
    return serverError(res, 'Error updating location', error);
  }
};

/**
 * Current locations of the organization's field members (members who may check in)
 * @route   GET /sales-locations/executives
 * @access  crm.locations.read
 */
const getSalesExecutivesLocations = async (req, res) => {
  try {
    const { organizationId } = tenantOf(req);
    const results = await pool.query(
      `SELECT u.id, u.full_name, ul.latitude, ul.longitude, ul.address, ul.updated_at
       FROM organization_memberships m
       JOIN users u ON u.id = m.user_id AND COALESCE(u.is_active, true)
       LEFT JOIN user_locations ul ON ul.user_id = u.id AND ul.organization_id = m.organization_id
       WHERE m.organization_id = $1
         AND m.status = 'active'
         AND EXISTS (
           SELECT 1 FROM role_permissions rp
           WHERE rp.role_id = m.role_id AND rp.permission_key = 'crm.locations.checkin'
         )
       ORDER BY u.full_name`,
      [organizationId]
    );

    res.status(200).json({
      success: true,
      count: results.rows.length,
      executives: results.rows
    });
  } catch (error) {
    return serverError(res, 'Error retrieving sales executives locations', error);
  }
};

export {
  getSalesLocations,
  createSalesLocation,
  updateSalesLocation,
  deleteSalesLocation,
  updateSalesExecutiveLocation,
  getSalesExecutivesLocations
};
