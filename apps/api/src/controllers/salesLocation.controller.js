/**
 * Sales Location Controller
 * 
 * This file contains controller functions for managing sales locations
 */

import pool from '../config/db.js';
import { logAuditEvent } from '../utils/auditLogger.js';

/**
 * Get all sales locations
 * @route   GET /sales-locations
 * @desc    Get all sales locations
 * @access  Private (Admin and Manager only)
 */
const getSalesLocations = async (req, res) => {
  try {
    const { roleId } = req.user;

    // Only Admin and Manager can access sales locations
    if (roleId !== 1 && roleId !== 2) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Only Admin and Manager can access sales locations.'
      });
    }

    const query = `
      SELECT sl.*, u.full_name 
      FROM sales_locations sl
      LEFT JOIN users u ON sl.manager_id = u.id
      ORDER BY sl.name
    `;

    const results = await pool.query(query);

    res.status(200).json({
      success: true,
      count: results.rows.length,
      locations: results.rows
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error retrieving sales locations',
      error: error.message
    });
  }
};

/**
 * Create a new sales location
 * @route   POST /sales-locations
 * @desc    Create a new sales location
 * @access  Private (Admin only)
 */
const createSalesLocation = async (req, res) => {
  try {
    const { roleId, userId } = req.user;

    // Only Admin can create sales locations
    if (roleId !== 1) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Only Admin can create sales locations.'
      });
    }

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

    // Validate required fields
    if (!name) {
      return res.status(400).json({
        success: false,
        message: 'Location name is required'
      });
    }

    const query = `
      INSERT INTO sales_locations (
        name, address, city, state, country, pin_code, contact_phone, manager_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `;

    const values = [
      name,
      address || null,
      city || null,
      state || null,
      country,
      pin_code || null,
      contact_phone || null,
      manager_id || null
    ];

    const results = await pool.query(query, values);

    // Log the creation
    await logAuditEvent(
      userId,
      'CREATE_SALES_LOCATION',
      'sales_locations',
      results.rows[0].id,
      null,
      { name, manager_id },
      req.ip,
      req.get('User-Agent')
    );

    res.status(201).json({
      success: true,
      message: 'Sales location created successfully',
      location: results.rows[0]
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error creating sales location',
      error: error.message
    });
  }
};

/**
 * Update a sales location
 * @route   PUT /sales-locations/:id
 * @desc    Update a sales location
 * @access  Private (Admin only)
 */
const updateSalesLocation = async (req, res) => {
  try {
    const { roleId, userId } = req.user;

    // Only Admin can update sales locations
    if (roleId !== 1) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Only Admin can update sales locations.'
      });
    }

    const locationId = req.params.id;
    const {
      name,
      address,
      city,
      state,
      country,
      pin_code,
      contact_phone,
      manager_id
    } = req.body;

    // Check if location exists
    const checkQuery = 'SELECT * FROM sales_locations WHERE id = $1';
    const checkResult = await pool.query(checkQuery, [locationId]);

    if (checkResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Sales location not found'
      });
    }

    // Store old values for audit
    const oldValues = checkResult.rows[0];

    // Update fields
    const updateFields = [];
    const updateValues = [];
    let paramIndex = 1;

    if (name !== undefined) {
      updateFields.push(`name = $${paramIndex++}`);
      updateValues.push(name);
    }

    if (address !== undefined) {
      updateFields.push(`address = $${paramIndex++}`);
      updateValues.push(address);
    }

    if (city !== undefined) {
      updateFields.push(`city = $${paramIndex++}`);
      updateValues.push(city);
    }

    if (state !== undefined) {
      updateFields.push(`state = $${paramIndex++}`);
      updateValues.push(state);
    }

    if (country !== undefined) {
      updateFields.push(`country = $${paramIndex++}`);
      updateValues.push(country);
    }

    if (pin_code !== undefined) {
      updateFields.push(`pin_code = $${paramIndex++}`);
      updateValues.push(pin_code);
    }

    if (contact_phone !== undefined) {
      updateFields.push(`contact_phone = $${paramIndex++}`);
      updateValues.push(contact_phone);
    }

    if (manager_id !== undefined) {
      updateFields.push(`manager_id = $${paramIndex++}`);
      updateValues.push(manager_id);
    }

    if (updateFields.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid fields to update'
      });
    }

    updateValues.push(locationId);

    const updateQuery = `
      UPDATE sales_locations
      SET ${updateFields.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const results = await pool.query(updateQuery, updateValues);

    // Log the update
    await logAuditEvent(
      userId,
      'UPDATE_SALES_LOCATION',
      'sales_locations',
      locationId,
      oldValues,
      results.rows[0],
      req.ip,
      req.get('User-Agent')
    );

    res.status(200).json({
      success: true,
      message: 'Sales location updated successfully',
      location: results.rows[0]
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error updating sales location',
      error: error.message
    });
  }
};

/**
 * Delete a sales location
 * @route   DELETE /sales-locations/:id
 * @desc    Delete a sales location
 * @access  Private (Admin only)
 */
const deleteSalesLocation = async (req, res) => {
  try {
    const { roleId, userId } = req.user;

    // Only Admin can delete sales locations
    if (roleId !== 1) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Only Admin can delete sales locations.'
      });
    }

    const locationId = req.params.id;

    // Check if location exists
    const checkQuery = 'SELECT * FROM sales_locations WHERE id = $1';
    const checkResult = await pool.query(checkQuery, [locationId]);

    if (checkResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Sales location not found'
      });
    }

    // Check if location is referenced by any leads
    const leadsCheckQuery = 'SELECT COUNT(*) FROM leads WHERE location_id = $1';
    const leadsCheckResult = await pool.query(leadsCheckQuery, [locationId]);

    if (parseInt(leadsCheckResult.rows[0].count) > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete sales location. It is referenced by one or more leads.'
      });
    }

    // Store old values for audit
    const oldValues = checkResult.rows[0];

    // Delete the location
    const deleteQuery = 'DELETE FROM sales_locations WHERE id = $1';
    await pool.query(deleteQuery, [locationId]);

    // Log the deletion
    await logAuditEvent(
      userId,
      'DELETE_SALES_LOCATION',
      'sales_locations',
      locationId,
      oldValues,
      null,
      req.ip,
      req.get('User-Agent')
    );

    res.status(200).json({
      success: true,
      message: 'Sales location deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error deleting sales location',
      error: error.message
    });
  }
};

/**
 * Update sales executive current location
 * @route   POST /sales-locations/update-location
 * @desc    Update the current location of a sales executive
 * @access  Private (Sales only)
 */
const updateSalesExecutiveLocation = async (req, res) => {
  try {
    const { roleId, userId } = req.user;

    // Only Sales users can update their location
    if (roleId !== 3) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Only Sales users can update their location.'
      });
    }

    const { latitude, longitude, address } = req.body;

    // Validate required fields
    if (!latitude || !longitude) {
      return res.status(400).json({
        success: false,
        message: 'Latitude and longitude are required'
      });
    }

    // Check if a location record already exists for this user
    const checkQuery = 'SELECT * FROM user_locations WHERE user_id = $1';
    const checkResult = await pool.query(checkQuery, [userId]);

    let query;
    let values;

    if (checkResult.rows.length > 0) {
      // Update existing record
      query = `
        UPDATE user_locations
        SET latitude = $1, longitude = $2, address = $3, updated_at = CURRENT_TIMESTAMP
        WHERE user_id = $4
        RETURNING *
      `;
      values = [latitude, longitude, address || null, userId];
    } else {
      // Create new record
      query = `
        INSERT INTO user_locations (user_id, latitude, longitude, address)
        VALUES ($1, $2, $3, $4)
        RETURNING *
      `;
      values = [userId, latitude, longitude, address || null];
    }

    const results = await pool.query(query, values);

    res.status(200).json({
      success: true,
      message: 'Location updated successfully',
      location: results.rows[0]
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error updating location',
      error: error.message
    });
  }
};

/**
 * Get sales executives' current locations
 * @route   GET /sales-locations/executives
 * @desc    Get current locations of all sales executives
 * @access  Private (Admin and Manager only)
 */
const getSalesExecutivesLocations = async (req, res) => {
  try {
    const { roleId } = req.user;

    // Only Admin and Manager can access sales executives' locations
    if (roleId !== 1 && roleId !== 2) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Only Admin and Manager can access sales executives locations.'
      });
    }

    const query = `
      SELECT u.id, u.full_name, ul.latitude, ul.longitude, ul.address, ul.updated_at
      FROM users u
      LEFT JOIN user_locations ul ON u.id = ul.user_id
      WHERE u.role_id = 3 AND u.is_active = true
      ORDER BY u.full_name
    `;

    const results = await pool.query(query);

    res.status(200).json({
      success: true,
      count: results.rows.length,
      executives: results.rows
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error retrieving sales executives locations',
      error: error.message
    });
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
