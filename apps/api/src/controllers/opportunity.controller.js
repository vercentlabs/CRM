import pool from '../config/db.js';
import { withTransaction } from '../utils/dbTransaction.js';
import { logAuditEvent } from '../utils/auditLogger.js';
import { hasPermission, isActiveMember, parseId, scopeFor, serverError, tenantOf } from '../platform/tenancy.js';
import { OWN_LEAD } from './lead.controller.js';

/** Own scope: assigned to me, or unassigned and created by me. */
const OWN_OPPORTUNITY = (alias, param) =>
  `(${alias}.assigned_to = ${param} OR (${alias}.assigned_to IS NULL AND ${alias}.created_by = ${param}))`;

const isOwnOpportunity = (opportunity, userId) =>
  opportunity.assigned_to === userId || (opportunity.assigned_to === null && opportunity.created_by === userId);

/**
 * Create a new opportunity
 * @route   POST /opportunities
 * @access  crm.opportunities.create; the lead must be visible to the caller
 */
const createOpportunity = async (req, res) => {
  try {
    const { organizationId, userId } = tenantOf(req);
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

    if (!lead_id || !title) {
      return res.status(400).json({
        success: false,
        message: 'Lead ID and title are required'
      });
    }

    if (typeof title !== 'string' || title.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Title must be a non-empty string'
      });
    }

    const validStages = ['Prospecting', 'Qualification', 'Needs Analysis', 'Value Proposition', 'Proposal', 'Negotiation', 'Closed Won', 'Closed Lost'];
    if (stage && (typeof stage !== 'string' || !validStages.includes(stage))) {
      return res.status(400).json({
        success: false,
        message: 'Stage must be one of: Prospecting, Qualification, Needs Analysis, Value Proposition, Proposal, Negotiation, Closed Won, Closed Lost'
      });
    }

    if (probability !== undefined && (isNaN(probability) || probability < 0 || probability > 100)) {
      return res.status(400).json({
        success: false,
        message: 'Probability must be a number between 0 and 100'
      });
    }

    let finalAssignedTo = null;
    const requested = assigned_to === undefined || assigned_to === null || assigned_to === '' ? null : parseId(assigned_to);
    if (scopeFor(req, 'crm.opportunities.create') !== 'organization') {
      if (requested !== null && requested !== userId) {
        return res.status(403).json({
          success: false,
          message: 'Sales users can only assign opportunities to themselves'
        });
      }
      finalAssignedTo = userId;
    } else if (requested !== null) {
      if (requested !== userId && !hasPermission(req, 'crm.opportunities.assign')) {
        return res.status(403).json({ success: false, message: 'You cannot assign opportunities to other members' });
      }
      if (!(await isActiveMember(organizationId, requested))) {
        return res.status(400).json({ success: false, message: 'Assigned user is not a member of this organization' });
      }
      finalAssignedTo = requested;
    } else if (assigned_to) {
      return res.status(400).json({ success: false, message: 'Assigned user is not a member of this organization' });
    }

    // The lead must exist in this organization and be within the caller's lead scope.
    const leadId = parseId(lead_id);
    const leadParams = [leadId ?? 0, organizationId];
    let leadQuery = 'SELECT l.id FROM leads l WHERE l.id = $1 AND l.organization_id = $2';
    if (scopeFor(req, 'crm.leads.read') !== 'organization') {
      leadParams.push(userId);
      leadQuery += ` AND ${OWN_LEAD('l', '$3')}`;
    }
    const leadResult = await pool.query(leadQuery, leadParams);
    if (leadResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Lead not found'
      });
    }

    const results = await pool.query(
      `INSERT INTO opportunities (
         organization_id, lead_id, title, description, value, stage, probability, expected_close_date,
         created_by, assigned_to
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id`,
      [
        organizationId,
        leadId,
        title,
        description || null,
        value || null,
        stage || 'Prospecting',
        probability || null,
        expected_close_date || null,
        userId,
        finalAssignedTo
      ]
    );

    await logAuditEvent(
      userId,
      'CREATE_OPPORTUNITY',
      'opportunities',
      results.rows[0].id,
      null,
      {
        lead_id: leadId,
        title,
        description,
        value,
        stage,
        probability,
        expected_close_date,
        assigned_to: finalAssignedTo
      }
    );

    res.status(201).json({
      message: 'Opportunity created successfully',
      opportunity: {
        id: results.rows[0].id,
        created_by: userId,
        assigned_to: finalAssignedTo
      }
    });
  } catch (error) {
    return serverError(res, 'Error creating opportunity', error);
  }
};

/**
 * Get opportunities
 * @route   GET /opportunities
 * @access  crm.opportunities.read (own scope: own opportunities only)
 */
const getOpportunities = async (req, res) => {
  try {
    const { organizationId, userId } = tenantOf(req);
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const offset = (page - 1) * limit;

    const params = [organizationId];
    let where = 'WHERE o.organization_id = $1';
    if (scopeFor(req, 'crm.opportunities.read') !== 'organization') {
      params.push(userId);
      where += ` AND ${OWN_OPPORTUNITY('o', '$2')}`;
    }

    const query = `
      SELECT o.*, l.full_name as lead_name, l.email as lead_email, u.full_name as assigned_to_name
      FROM opportunities o
      LEFT JOIN leads l ON o.lead_id = l.id AND l.organization_id = o.organization_id
      LEFT JOIN users u ON o.assigned_to = u.id
      ${where}
      ORDER BY o.created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;

    const [results, countResult] = await Promise.all([
      pool.query(query, [...params, limit, offset]),
      pool.query(`SELECT COUNT(o.id) FROM opportunities o ${where}`, params)
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
    return serverError(res, 'Error retrieving opportunities', error);
  }
};

/**
 * Assign an opportunity to a member
 * @route   PATCH /opportunities/:opportunityId/assign
 * @access  crm.opportunities.assign (organization scope)
 */
const assignOpportunity = async (req, res) => {
  try {
    const { organizationId, userId } = tenantOf(req);
    const opportunityId = parseId(req.params.opportunityId);
    const { assigned_to } = req.body;
    const salesUserId = assigned_to === null || assigned_to === undefined || assigned_to === '' ? null : parseId(assigned_to);

    if (opportunityId === null) {
      return res.status(404).json({ success: false, message: 'Opportunity not found' });
    }
    if (salesUserId !== null ? !(await isActiveMember(organizationId, salesUserId)) : assigned_to) {
      return res.status(400).json({ success: false, message: 'Assigned user is not a member of this organization' });
    }

    const found = await withTransaction(async (client) => {
      const opportunityResult = await client.query(
        'SELECT id, assigned_to FROM opportunities WHERE id = $1 AND organization_id = $2 FOR UPDATE',
        [opportunityId, organizationId]
      );
      if (opportunityResult.rows.length === 0) return false;

      const oldAssignment = opportunityResult.rows[0].assigned_to;
      await client.query(
        'UPDATE opportunities SET assigned_to = $1 WHERE id = $2 AND organization_id = $3',
        [salesUserId, opportunityId, organizationId]
      );

      await logAuditEvent(
        userId,
        'ASSIGN_OPPORTUNITY',
        'opportunities',
        opportunityId,
        { assigned_to: oldAssignment },
        { assigned_to: salesUserId, changed_by: userId }
      );
      return true;
    });

    if (!found) {
      return res.status(404).json({ success: false, message: 'Opportunity not found' });
    }

    res.status(200).json({
      message: 'Opportunity assigned successfully',
      opportunityId,
      assignedTo: salesUserId
    });
  } catch (error) {
    return serverError(res, 'Error assigning opportunity', error);
  }
};

/**
 * Update an opportunity
 * @route   PUT /opportunities/:id
 * @access  crm.opportunities.update (own scope: opportunities assigned to me)
 */
const updateOpportunity = async (req, res) => {
  try {
    const { organizationId, userId } = tenantOf(req);
    const opportunityId = parseId(req.params.id);
    const { title, description, value, stage, probability, expected_close_date } = req.body;

    if (opportunityId === null) {
      return res.status(404).json({ message: 'Opportunity not found' });
    }

    const results = await pool.query(
      'SELECT id, assigned_to, created_by, stage FROM opportunities WHERE id = $1 AND organization_id = $2',
      [opportunityId, organizationId]
    );

    if (results.rows.length === 0) {
      return res.status(404).json({
        message: 'Opportunity not found'
      });
    }

    const opportunity = results.rows[0];
    const oldStage = opportunity.stage;

    if (scopeFor(req, 'crm.opportunities.update') !== 'organization' && !isOwnOpportunity(opportunity, userId)) {
      return res.status(403).json({
        message: 'Forbidden: You can only update opportunities assigned to you'
      });
    }

    const updateFields = [];
    const updateValues = [];
    const set = (column, fieldValue) => {
      updateValues.push(fieldValue);
      updateFields.push(`${column} = $${updateValues.length}`);
    };

    if (title !== undefined) set('title', title);
    if (description !== undefined) set('description', description);
    if (value !== undefined) set('value', value);
    if (stage !== undefined) set('stage', stage);
    if (probability !== undefined) set('probability', probability);
    if (expected_close_date !== undefined) set('expected_close_date', expected_close_date);

    if (updateFields.length === 0) {
      return res.status(400).json({
        message: 'No valid fields to update'
      });
    }

    updateValues.push(opportunityId, organizationId);
    try {
      await pool.query(
        `UPDATE opportunities SET ${updateFields.join(', ')}
         WHERE id = $${updateValues.length - 1} AND organization_id = $${updateValues.length}`,
        updateValues
      );
    } catch (error) {
      if (error.code === '23514') {
        return res.status(400).json({ message: 'Opportunity data violates a validation rule' });
      }
      throw error;
    }

    if (stage !== undefined && stage !== oldStage) {
      await logAuditEvent(
        userId,
        'UPDATE_OPPORTUNITY_STAGE',
        'opportunities',
        opportunityId,
        { stage: oldStage },
        { stage, updated_by: userId }
      );
    }

    res.status(200).json({
      message: 'Opportunity updated successfully',
      opportunityId,
      updatedFields: updateFields.map(field => field.split(' = ')[0])
    });
  } catch (error) {
    return serverError(res, 'Error updating opportunity', error);
  }
};

export {
  createOpportunity,
  getOpportunities,
  assignOpportunity,
  updateOpportunity
};
