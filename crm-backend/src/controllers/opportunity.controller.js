import pool from '../config/db.js';
import { withTransaction } from '../utils/dbTransaction.js';
import { logAuditEvent } from '../utils/auditLogger.js';

/**
 * Create a new opportunity
 * @route   POST /opportunities
 * @desc    Create a new opportunity with provided information
 * @access  Private
 */
const createOpportunity = async (req, res) => {
  try {
    // Extract all opportunity fields from request body
    const {
      lead_id,
      title,
      description,
      value,
      stage,
      probability,
      expected_close_date,
      assigned_to
    } = req.body;

    // Get user information from the request
    const { roleId: role, userId } = req.user;

    // Validate required fields
    if (!lead_id || !title) {
      return res.status(400).json({
        success: false,
        message: 'Lead ID and title are required'
      });
    }

    // Validate title (must be a non-empty string)
    if (typeof title !== 'string' || title.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Title must be a non-empty string'
      });
    }

    // Validate stage if provided (must be a string and one of allowed values)
    const validStages = ['Prospecting', 'Qualification', 'Needs Analysis', 'Value Proposition', 'Proposal', 'Negotiation', 'Closed Won', 'Closed Lost'];
    if (stage && (typeof stage !== 'string' || !validStages.includes(stage))) {
      return res.status(400).json({
        success: false,
        message: 'Stage must be one of: Prospecting, Qualification, Needs Analysis, Value Proposition, Proposal, Negotiation, Closed Won, Closed Lost'
      });
    }

    // Validate probability if provided (must be a number between 0 and 100)
    if (probability !== undefined && (isNaN(probability) || probability < 0 || probability > 100)) {
      return res.status(400).json({
        success: false,
        message: 'Probability must be a number between 0 and 100'
      });
    }

    // Check role-based assignment rules
    let finalAssignedTo = null;

    if (role === 3) { // Sales role
      // For sales users, assigned_to must be null or same as userId
      if (assigned_to && assigned_to !== userId) {
        return res.status(403).json({
          success: false,
          message: 'Sales users can only assign opportunities to themselves'
        });
      }
      finalAssignedTo = assigned_to || userId;
    } else if (role === 1 || role === 2) { // Admin or Manager
      // For admin or manager, allow any assigned_to value
      finalAssignedTo = assigned_to || null;
    }

    // Check if lead exists
    const leadCheckQuery = 'SELECT id, full_name, assigned_to FROM leads WHERE id = $1';
    const leadResult = await pool.query(leadCheckQuery, [lead_id]);

    if (leadResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Lead not found'
      });
    }

    // Insert all fields into opportunities table, using NULL for missing optional fields
    const query = `
      INSERT INTO opportunities (
        lead_id,
        title,
        description,
        value,
        stage,
        probability,
        expected_close_date,
        created_by,
        assigned_to
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id
    `;

    // Handle optional fields by using NULL if they're not provided
    const values = [
      lead_id,
      title,
      description || null,
      value || null,
      stage || 'Prospecting',
      probability || null,
      expected_close_date || null,
      userId, // created_by
      finalAssignedTo // assigned_to
    ];

    try {
      const results = await pool.query(query, values);

      // Log opportunity creation
      await logAuditEvent(
        userId,
        'CREATE_OPPORTUNITY',
        'opportunities',
        results.rows[0].id,
        null,
        {
          lead_id,
          title,
          description,
          value,
          stage,
          probability,
          expected_close_date,
          assigned_to: finalAssignedTo
        },
        req.ip,
        req.get('User-Agent')
      );

      // Return the created opportunity's ID
      res.status(201).json({
        message: 'Opportunity created successfully',
        opportunity: {
          id: results.rows[0].id,
          created_by: userId,
          assigned_to: finalAssignedTo
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error creating opportunity',
        error: error.message
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

/**
 * Get all opportunities
 * @route   GET /opportunities
 * @desc    Get all opportunities based on user role
 * @access  Private
 */
const getOpportunities = async (req, res) => {
  try {
    const { roleId: role, userId } = req.user;

    // Pagination parameters with defaults and max limit
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100); // Default 20, max 100
    const offset = (page - 1) * limit;

    let query;
    let queryParams = [];
    let countQuery;
    let countParams = [];

    if (role === 1) { // Admin - can see all opportunities
      query = `
        SELECT o.*, l.full_name as lead_name, l.email as lead_email, u.full_name as assigned_to_name
        FROM opportunities o
        LEFT JOIN leads l ON o.lead_id = l.id
        LEFT JOIN users u ON o.assigned_to = u.id
        ORDER BY o.created_at DESC
        LIMIT $1 OFFSET $2
      `;
      queryParams = [limit, offset];

      countQuery = `SELECT COUNT(id) FROM opportunities`;  // More efficient than COUNT(*)
    } else if (role === 3) { // Sales - can see only their assigned opportunities or unassigned opportunities they created
      query = `
        SELECT o.*, l.full_name as lead_name, l.email as lead_email, u.full_name as assigned_to_name
        FROM opportunities o
        LEFT JOIN leads l ON o.lead_id = l.id
        LEFT JOIN users u ON o.assigned_to = u.id
        WHERE o.assigned_to = $1 OR (o.assigned_to IS NULL AND o.created_by = $1)
        ORDER BY o.created_at DESC
        LIMIT $2 OFFSET $3
      `;
      queryParams = [userId, limit, offset];

      countQuery = `SELECT COUNT(id) FROM opportunities WHERE assigned_to = $1 OR (assigned_to IS NULL AND created_by = $1)`;
      countParams = [userId];
    } else if (role === 2) { // Manager - can see all opportunities
      query = `
        SELECT o.*, l.full_name as lead_name, l.email as lead_email, u.full_name as assigned_to_name
        FROM opportunities o
        LEFT JOIN leads l ON o.lead_id = l.id
        LEFT JOIN users u ON o.assigned_to = u.id
        ORDER BY o.created_at DESC
        LIMIT $1 OFFSET $2
      `;
      queryParams = [limit, offset];

      countQuery = `SELECT COUNT(id) FROM opportunities`;  // More efficient than COUNT(*)
    } else {
      return res.status(403).json({
        message: 'Unauthorized role'
      });
    }

    try {
      // Execute both queries in parallel
      const [results, countResult] = await Promise.all([
        pool.query(query, queryParams),
        pool.query(countQuery, countParams)
      ]);

      const totalItems = parseInt(countResult.rows[0].count);
      const totalPages = Math.ceil(totalItems / limit);

      res.status(200).json({
        opportunities: results.rows,
        pagination: {
          page,
          limit,
          totalItems,
          totalPages,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1
        }
      });
    } catch (error) {
      res.status(500).json({
        message: 'Error retrieving opportunities',
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

/**
 * Assign an opportunity to a sales user
 * @route   PATCH /opportunities/:opportunityId/assign
 * @desc    Assign an opportunity to a sales user
 * @access  Private (Admin only)
 */
const assignOpportunity = async (req, res) => {
  try {
    const { opportunityId } = req.params;
    const { assigned_to: salesUserId } = req.body;

    // Use transaction helper for all related database operations
    await withTransaction(async (client) => {
      // Check if opportunity exists and get current assignment
      const checkOpportunityQuery = 'SELECT id, assigned_to FROM opportunities WHERE id = $1 FOR UPDATE';
      const opportunityResult = await client.query(checkOpportunityQuery, [opportunityId]);

      if (opportunityResult.rows.length === 0) {
        throw new Error('Opportunity not found');
      }

      // Store old assignment value for audit logging
      const oldAssignment = opportunityResult.rows[0].assigned_to;

      // Update opportunity assignment
      const updateQuery = 'UPDATE opportunities SET assigned_to = $1 WHERE id = $2';
      const updateResult = await client.query(updateQuery, [salesUserId, opportunityId]);

      // Check if the update actually affected any rows
      if (updateResult.rowCount === 0) {
        throw new Error('Failed to update opportunity assignment');
      }

      // Log assignment change
      await logAuditEvent(
        req.user.userId,
        'ASSIGN_OPPORTUNITY',
        'opportunities',
        opportunityId,
        { assigned_to: oldAssignment },
        { assigned_to: salesUserId, changed_by: req.user.userId },
        req.ip,
        req.get('User-Agent')
      );
    });

    res.status(200).json({
      message: 'Opportunity assigned successfully',
      opportunityId,
      assignedTo: salesUserId
    });
  } catch (error) {
    // Handle specific errors
    if (error.message === 'Opportunity not found') {
      return res.status(404).json({
        success: false,
        message: 'Opportunity not found'
      });
    }

    // Generic error response
    res.status(500).json({
      success: false,
      message: 'Error assigning opportunity',
      error: error.message
    });
  }
};

/**
 * Update an opportunity
 * @route   PUT /opportunities/:id
 * @desc    Update opportunity details
 * @access  Private
 */
const updateOpportunity = async (req, res) => {
  try {
    const opportunityId = req.params.id; // Using id for PUT /opportunities/:id route
    const { title, description, value, stage, probability, expected_close_date } = req.body;
    const { userId } = req.user;

    // Check if opportunity exists and get current assignment
    const checkOpportunityQuery = 'SELECT id, assigned_to, stage FROM opportunities WHERE id = $1';
    const results = await pool.query(checkOpportunityQuery, [opportunityId]);

    if (results.rows.length === 0) {
      return res.status(404).json({
        message: 'Opportunity not found'
      });
    }

    // Check if opportunity is assigned to the current user
    const opportunity = results.rows[0];
    const { roleId: role } = req.user;

    // Store old stage for audit logging
    const oldStage = opportunity.stage;

    if (opportunity.assigned_to !== userId) {
      // Role-specific error messages
      if (role === 2) { // Manager
        return res.status(403).json({
          message: 'Managers are not allowed to update opportunity details'
        });
      } else if (role === 3) { // Sales
        return res.status(403).json({
          message: 'You cannot update opportunities assigned to another sales executive'
        });
      } else {
        return res.status(403).json({
          message: 'Forbidden: You can only update opportunities assigned to you'
        });
      }
    }

    // Update allowed fields
    const updateFields = [];
    const updateValues = [];
    let paramIndex = 1;

    if (title !== undefined) {
      updateFields.push(`title = $${paramIndex++}`);
      updateValues.push(title);
    }

    if (description !== undefined) {
      updateFields.push(`description = $${paramIndex++}`);
      updateValues.push(description);
    }

    if (value !== undefined) {
      updateFields.push(`value = $${paramIndex++}`);
      updateValues.push(value);
    }

    if (stage !== undefined) {
      updateFields.push(`stage = $${paramIndex++}`);
      updateValues.push(stage);
    }

    if (probability !== undefined) {
      updateFields.push(`probability = $${paramIndex++}`);
      updateValues.push(probability);
    }

    if (expected_close_date !== undefined) {
      updateFields.push(`expected_close_date = $${paramIndex++}`);
      updateValues.push(expected_close_date);
    }

    if (updateFields.length === 0) {
      return res.status(400).json({
        message: 'No valid fields to update'
      });
    }

    updateValues.push(opportunityId);

    const updateQuery = `
      UPDATE opportunities
      SET ${updateFields.join(', ')}
      WHERE id = $${paramIndex}
    `;

    try {
      await pool.query(updateQuery, updateValues);

      // Log stage change if stage was updated
      if (stage !== undefined && stage !== oldStage) {
        await logAuditEvent(
          userId,
          'UPDATE_OPPORTUNITY_STAGE',
          'opportunities',
          opportunityId,
          { stage: oldStage },
          { stage: stage, updated_by: userId },
          req.ip,
          req.get('User-Agent')
        );
      }

      res.status(200).json({
        message: 'Opportunity updated successfully',
        opportunityId,
        updatedFields: updateFields.map(field => field.split(' = ')[0])
      });
    } catch (error) {
      res.status(500).json({
        message: 'Error updating opportunity',
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
  createOpportunity,
  getOpportunities,
  assignOpportunity,
  updateOpportunity
};
