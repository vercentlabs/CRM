import pool from '../config/db.js';
import { withTransaction } from '../utils/dbTransaction.js';
import { logAuditEvent } from '../utils/auditLogger.js';
import { hasPermission, isActiveMember, parseId, scopeFor, serverError, tenantOf } from '../platform/tenancy.js';

/**
 * Tenant rules (Phase 2): every query is bounded by the verified organization
 * (req.auth); `own` scope = assigned to me, or unassigned and created by me.
 */
const OWN_LEAD = (alias, param) =>
  `(${alias}.assigned_to = ${param} OR (${alias}.assigned_to IS NULL AND ${alias}.created_by = ${param}))`;

const isOwnLead = (lead, userId) =>
  lead.assigned_to === userId || (lead.assigned_to === null && lead.created_by === userId);

const LEAD_COLUMNS = `
  id, full_name, mobile_number, alternate_number, email, source, notes, age, address, occupation,
  monthly_income, is_aware_of_digital_gold, status, next_call_at, created_by, assigned_to,
  location_id, created_at, updated_at`;

const locationInOrg = async (organizationId, locationId) => {
  const result = await pool.query(
    'SELECT 1 FROM sales_locations WHERE id = $1 AND organization_id = $2',
    [locationId, organizationId]
  );
  return result.rows.length > 0;
};

/**
 * Create a new lead
 * @route   POST /leads
 * @access  crm.leads.create (own scope: the lead is assigned to the creator)
 */
const createLead = async (req, res) => {
  try {
    const {
      full_name,
      mobile_number,
      alternate_number,
      email,
      source,
      notes,
      age,
      address,
      occupation,
      monthly_income,
      is_aware_of_digital_gold,
      status,
      next_call_at,
      assigned_to,
      location_id
    } = req.body;

    const { organizationId, userId } = tenantOf(req);

    // Validate required fields
    if (!full_name || !mobile_number) {
      return res.status(400).json({
        success: false,
        message: 'Full name and mobile number are required'
      });
    }

    if (typeof full_name !== 'string' || full_name.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Full name must be a non-empty string'
      });
    }

    if (typeof mobile_number !== 'string' || !/^\d{10}$/.test(mobile_number)) {
      return res.status(400).json({
        success: false,
        message: 'Mobile number must be a string of exactly 10 digits'
      });
    }

    if (alternate_number && (typeof alternate_number !== 'string' || !/^\d{10}$/.test(alternate_number))) {
      return res.status(400).json({
        success: false,
        message: 'Alternate number must be a string of exactly 10 digits'
      });
    }

    if (email && (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
      return res.status(400).json({
        success: false,
        message: 'Email must be a valid email address'
      });
    }

    const validStatuses = ['New', 'Contacted', 'Qualified', 'Converted', 'Lost'];
    const trimmedStatus = typeof status === 'string' ? status.trim() : status;
    if (trimmedStatus && !validStatuses.includes(trimmedStatus)) {
      return res.status(400).json({
        success: false,
        message: 'Status must be one of: New, Contacted, Qualified, Converted, Lost'
      });
    }
    const finalStatus = trimmedStatus || 'New';

    const validSources = ['website', 'referral', 'social_media', 'email_campaign', 'cold_call', 'event', 'other'];
    if (source && (typeof source !== 'string' || !validSources.includes(source))) {
      return res.status(400).json({
        success: false,
        message: 'Source must be one of: website, referral, social_media, email_campaign, cold_call, event, other'
      });
    }

    // Assignment rules: own-scope creators may only assign to themselves;
    // assigning to someone else requires crm.leads.assign and an active member.
    let finalAssignedTo = null;
    const requestedAssignee = assigned_to === undefined || assigned_to === null || assigned_to === '' ? null : parseId(assigned_to);
    if (assigned_to && requestedAssignee === null) {
      return res.status(400).json({ success: false, message: 'Assigned user is not a member of this organization' });
    }

    if (scopeFor(req, 'crm.leads.create') === 'own') {
      if (requestedAssignee !== null && requestedAssignee !== userId) {
        return res.status(403).json({
          success: false,
          message: 'Sales users can only assign leads to themselves'
        });
      }
      finalAssignedTo = userId;
    } else if (requestedAssignee !== null) {
      if (requestedAssignee !== userId && !hasPermission(req, 'crm.leads.assign')) {
        return res.status(403).json({ success: false, message: 'You cannot assign leads to other members' });
      }
      if (!(await isActiveMember(organizationId, requestedAssignee))) {
        return res.status(400).json({ success: false, message: 'Assigned user is not a member of this organization' });
      }
      finalAssignedTo = requestedAssignee;
    }

    const locationId = location_id ? parseId(location_id) : null;
    if (location_id && (locationId === null || !(await locationInOrg(organizationId, locationId)))) {
      return res.status(400).json({ success: false, message: 'Sales location not found' });
    }

    const query = `
      INSERT INTO leads (
        organization_id, full_name, mobile_number, alternate_number, email, source, notes, age, address,
        occupation, monthly_income, is_aware_of_digital_gold, status, next_call_at, created_by,
        assigned_to, location_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      RETURNING ${LEAD_COLUMNS}
    `;

    const values = [
      organizationId,
      full_name,
      mobile_number,
      alternate_number || null,
      email || null,
      source || null,
      notes || null,
      age || null,
      address || null,
      occupation || null,
      monthly_income || null,
      is_aware_of_digital_gold || false,
      finalStatus,
      next_call_at || null,
      userId,
      finalAssignedTo,
      locationId
    ];

    try {
      const results = await pool.query(query, values);
      const lead = results.rows[0];

      await logAuditEvent(
        userId,
        'CREATE_LEAD',
        'leads',
        lead.id,
        null,
        {
          full_name,
          mobile_number,
          alternate_number,
          email,
          source,
          notes,
          age,
          address,
          occupation,
          monthly_income,
          is_aware_of_digital_gold,
          status: finalStatus,
          next_call_at,
          assigned_to: finalAssignedTo,
          location_id: locationId
        }
      );

      res.status(201).json({
        message: 'Lead created successfully',
        lead
      });
    } catch (error) {
      if (error.code === '23514') {
        if (error.constraint === 'leads_status_check') {
          return res.status(400).json({
            success: false,
            message: 'Status must be one of: New, Contacted, Qualified, Converted, Lost'
          });
        } else if (error.constraint === 'leads_mobile_check') {
          return res.status(400).json({
            success: false,
            message: 'Mobile number must be exactly 10 digits'
          });
        } else if (error.constraint === 'leads_age_check') {
          return res.status(400).json({
            success: false,
            message: 'Age must be between 18 and 100'
          });
        }
        return res.status(400).json({
          success: false,
          message: 'Lead data violates a validation rule'
        });
      }
      return serverError(res, 'Error creating lead', error);
    }
  } catch (error) {
    return serverError(res, 'Server error', error);
  }
};

/**
 * Get leads
 * @route   GET /leads
 * @access  crm.leads.read (own scope: own leads only)
 */
const getLeads = async (req, res) => {
  try {
    const { organizationId, userId } = tenantOf(req);

    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const offset = (page - 1) * limit;

    const { status, assignedTo, dateFrom, dateTo } = req.query;

    const conditions = ['l.organization_id = $1'];
    const params = [organizationId];

    if (scopeFor(req, 'crm.leads.read') !== 'organization') {
      params.push(userId);
      conditions.push(OWN_LEAD('l', `$${params.length}`));
    }

    if (status) {
      params.push(status);
      conditions.push(`l.status = $${params.length}`);
    }

    if (assignedTo) {
      params.push(parseId(assignedTo) ?? 0);
      conditions.push(`l.assigned_to = $${params.length}`);
    }

    if (dateFrom) {
      const parsedDateFrom = new Date(dateFrom);
      if (isNaN(parsedDateFrom.getTime())) {
        return res.status(400).json({
          success: false,
          message: 'Invalid dateFrom format. Please use YYYY-MM-DD format.'
        });
      }
      params.push(dateFrom);
      conditions.push(`l.created_at::date >= $${params.length}`);
    }

    if (dateTo) {
      const dateToPlusOne = new Date(dateTo);
      if (isNaN(dateToPlusOne.getTime())) {
        return res.status(400).json({
          success: false,
          message: 'Invalid dateTo format. Please use YYYY-MM-DD format.'
        });
      }
      dateToPlusOne.setDate(dateToPlusOne.getDate() + 1);
      params.push(dateToPlusOne.toISOString().split('T')[0]);
      conditions.push(`l.created_at::date < $${params.length}`);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    const query = `
      SELECT l.id, l.full_name AS name, l.email, l.mobile_number, l.alternate_number, l.source, l.notes, l.age,
             l.address, l.occupation, l.monthly_income, l.is_aware_of_digital_gold, l.status, l.next_call_at,
             l.created_by, l.assigned_to, l.location_id, l.created_at, l.updated_at,
             u.full_name AS assigned_user_name
      FROM leads l
      LEFT JOIN users u ON l.assigned_to = u.id
      ${whereClause}
      ORDER BY l.created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;
    const countQuery = `SELECT COUNT(l.id) FROM leads l ${whereClause}`;

    const [results, countResult] = await Promise.all([
      pool.query(query, [...params, limit, offset]),
      pool.query(countQuery, params)
    ]);

    const totalItems = parseInt(countResult.rows[0].count);
    const totalPages = Math.ceil(totalItems / limit);

    res.status(200).json({
      leads: results.rows,
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
    return serverError(res, 'Error retrieving leads', error);
  }
};

/**
 * Assign a lead to a member
 * @route   PATCH /leads/:leadId/assign
 * @access  crm.leads.assign (organization scope)
 */
const assignLead = async (req, res) => {
  try {
    const { organizationId, userId } = tenantOf(req);
    const leadId = parseId(req.params.leadId);
    const { assigned_to } = req.body;
    const salesUserId = assigned_to === null || assigned_to === undefined || assigned_to === '' ? null : parseId(assigned_to);

    if (leadId === null) {
      return res.status(404).json({ success: false, message: 'Lead not found' });
    }
    if (salesUserId !== null ? !(await isActiveMember(organizationId, salesUserId)) : assigned_to) {
      return res.status(400).json({ success: false, message: 'Assigned user is not a member of this organization' });
    }

    const found = await withTransaction(async (client) => {
      const leadResult = await client.query(
        'SELECT id, assigned_to FROM leads WHERE id = $1 AND organization_id = $2 FOR UPDATE',
        [leadId, organizationId]
      );
      if (leadResult.rows.length === 0) return false;

      const oldAssignment = leadResult.rows[0].assigned_to;
      await client.query(
        'UPDATE leads SET assigned_to = $1 WHERE id = $2 AND organization_id = $3',
        [salesUserId, leadId, organizationId]
      );

      await logAuditEvent(
        userId,
        'ASSIGN_LEAD',
        'leads',
        leadId,
        { assigned_to: oldAssignment },
        { assigned_to: salesUserId, changed_by: userId }
      );
      return true;
    });

    if (!found) {
      return res.status(404).json({ success: false, message: 'Lead not found' });
    }

    res.status(200).json({
      message: 'Lead assigned successfully',
      leadId,
      assignedTo: salesUserId
    });
  } catch (error) {
    return serverError(res, 'Error assigning lead', error);
  }
};

/**
 * Update a lead
 * @route   PUT /leads/:id
 * @access  crm.leads.update (own scope: own leads; reassigning others needs crm.leads.assign)
 */
const updateLead = async (req, res) => {
  try {
    const { organizationId, userId } = tenantOf(req);
    const leadId = parseId(req.params.id);
    const {
      status,
      notes,
      next_call_at,
      location_id,
      assigned_to,
      age,
      occupation,
      monthly_income,
      is_aware_of_digital_gold,
      full_name,
      mobile_number,
      alternate_number,
      email,
      address,
      source
    } = req.body;

    if (leadId === null) {
      return res.status(404).json({ message: 'Lead not found' });
    }

    const results = await pool.query(
      'SELECT id, assigned_to, created_by, status FROM leads WHERE id = $1 AND organization_id = $2',
      [leadId, organizationId]
    );

    if (results.rows.length === 0) {
      return res.status(404).json({
        message: 'Lead not found'
      });
    }

    const lead = results.rows[0];
    const oldStatus = lead.status;
    const ownScope = scopeFor(req, 'crm.leads.update') !== 'organization';

    if (ownScope && !isOwnLead(lead, userId)) {
      return res.status(403).json({
        message: 'You cannot update leads assigned to another sales executive'
      });
    }

    const updateFields = [];
    const updateValues = [];
    const set = (column, value) => {
      updateValues.push(value);
      updateFields.push(`${column} = $${updateValues.length}`);
    };

    if (status !== undefined) set('status', status);
    if (notes !== undefined) set('notes', notes);
    if (next_call_at !== undefined) set('next_call_at', next_call_at);

    if (location_id !== undefined) {
      const locationId = location_id === null || location_id === '' ? null : parseId(location_id);
      if (location_id && (locationId === null || !(await locationInOrg(organizationId, locationId)))) {
        return res.status(400).json({ message: 'Sales location not found' });
      }
      set('location_id', locationId);
    }

    if (assigned_to !== undefined) {
      const assignee = assigned_to === null || assigned_to === '' ? null : parseId(assigned_to);
      if (ownScope || !hasPermission(req, 'crm.leads.assign')) {
        if (assignee !== userId) {
          return res.status(403).json({
            message: 'Sales users can only assign leads to themselves'
          });
        }
      } else if (assignee !== null && !(await isActiveMember(organizationId, assignee))) {
        return res.status(400).json({ message: 'Assigned user is not a member of this organization' });
      }
      set('assigned_to', assignee);
    }

    if (age !== undefined) {
      if (age !== null && (typeof age !== 'number' || age < 18 || age > 100)) {
        return res.status(400).json({
          message: 'Age must be between 18 and 100'
        });
      }
      set('age', age);
    }

    if (occupation !== undefined) set('occupation', occupation);
    if (monthly_income !== undefined) set('monthly_income', monthly_income);
    if (is_aware_of_digital_gold !== undefined) set('is_aware_of_digital_gold', is_aware_of_digital_gold);
    if (full_name !== undefined) set('full_name', full_name);
    if (mobile_number !== undefined) set('mobile_number', mobile_number);
    if (alternate_number !== undefined) set('alternate_number', alternate_number);
    if (email !== undefined) set('email', email);
    if (address !== undefined) set('address', address);
    if (source !== undefined) set('source', source);

    if (updateFields.length === 0) {
      return res.status(400).json({
        message: 'No valid fields to update'
      });
    }

    updateValues.push(leadId, organizationId);
    const updateQuery = `
      UPDATE leads
      SET ${updateFields.join(', ')}
      WHERE id = $${updateValues.length - 1} AND organization_id = $${updateValues.length}
    `;

    try {
      await pool.query(updateQuery, updateValues);
    } catch (error) {
      if (error.code === '23514') {
        return res.status(400).json({ message: 'Lead data violates a validation rule' });
      }
      throw error;
    }

    if (status !== undefined && status !== oldStatus) {
      await logAuditEvent(
        userId,
        'UPDATE_LEAD_STATUS',
        'leads',
        leadId,
        { status: oldStatus },
        { status, updated_by: userId }
      );

      // Converting a lead creates the customer inside the same organization.
      if (status === 'Converted') {
        const leadDetailsResult = await pool.query(
          'SELECT * FROM leads WHERE id = $1 AND organization_id = $2',
          [leadId, organizationId]
        );
        const leadDetails = leadDetailsResult.rows[0];

        if (leadDetails?.email) {
          const newCustomer = await pool.query(
            `INSERT INTO customers (organization_id, name, email, phone, address, assigned_to, created_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             ON CONFLICT (organization_id, email) DO NOTHING
             RETURNING *`,
            [
              organizationId,
              leadDetails.full_name,
              leadDetails.email,
              leadDetails.mobile_number,
              leadDetails.address,
              leadDetails.assigned_to,
              userId
            ]
          );

          if (newCustomer.rows[0]) {
            const customer = newCustomer.rows[0];
            await logAuditEvent(
              userId,
              'LEAD_CONVERTED_TO_CUSTOMER',
              'customers',
              customer.id,
              null,
              {
                leadId,
                name: customer.name,
                email: customer.email,
                assignedTo: customer.assigned_to
              }
            );
          }
        }
      }
    }

    res.status(200).json({
      message: 'Lead updated successfully',
      leadId,
      updatedFields: updateFields.map(field => field.split(' = ')[0])
    });
  } catch (error) {
    return serverError(res, 'Error updating lead', error);
  }
};

/**
 * Create a followup for a lead
 * @route   POST /leads/:leadId/followups
 * @access  crm.followups.create; only the lead's assignee may schedule follow-ups
 */
const createFollowup = async (req, res) => {
  try {
    const { organizationId, userId } = tenantOf(req);
    const leadId = parseId(req.params.leadId);
    const { scheduled_at, followup_type, notes } = req.body;

    if (!req.params.leadId || !scheduled_at) {
      return res.status(400).json({
        success: false,
        message: 'scheduled_at is required'
      });
    }

    if (leadId === null) {
      return res.status(400).json({
        success: false,
        message: 'leadId must be a numeric value'
      });
    }

    const scheduledDate = new Date(scheduled_at);
    if (isNaN(scheduledDate.getTime()) || scheduledDate <= new Date()) {
      return res.status(400).json({
        success: false,
        message: 'scheduled_at must be a valid future datetime'
      });
    }

    const outcome = await withTransaction(async (client) => {
      const leadResult = await client.query(
        'SELECT id, assigned_to FROM leads WHERE id = $1 AND organization_id = $2 FOR UPDATE',
        [leadId, organizationId]
      );

      if (leadResult.rows.length === 0) return { status: 404 };
      if (leadResult.rows[0].assigned_to !== userId) return { status: 403 };

      const followupResult = await client.query(
        `INSERT INTO followups (organization_id, lead_id, assigned_to, followup_date, followup_type, status, notes)
         VALUES ($1, $2, $3, $4, $5, 'Pending', $6) RETURNING *`,
        [organizationId, leadId, userId, scheduled_at, followup_type || 'Call', notes]
      );

      const updateResults = await client.query(
        'UPDATE leads SET next_call_at = $1 WHERE id = $2 AND organization_id = $3 RETURNING *',
        [scheduled_at, leadId, organizationId]
      );

      await logAuditEvent(
        userId,
        'CREATE_FOLLOWUP',
        'followups',
        followupResult.rows[0].id,
        null,
        {
          lead_id: leadId,
          scheduled_at,
          created_by: userId,
          timestamp: new Date().toISOString()
        }
      );

      return { status: 201, followup: followupResult.rows[0], lead: updateResults.rows[0] };
    });

    if (outcome.status === 404) {
      return res.status(404).json({ success: false, message: 'Lead not found' });
    }
    if (outcome.status === 403) {
      return res.status(403).json({
        success: false,
        message: 'You can only create followups for leads assigned to you'
      });
    }

    res.status(201).json({
      message: 'Followup created successfully',
      followup: outcome.followup,
      lead: outcome.lead
    });
  } catch (error) {
    if (error.code === '23514') {
      return res.status(400).json({ success: false, message: 'Follow-up data violates a validation rule' });
    }
    return serverError(res, 'Error creating followup', error);
  }
};

/**
 * Get a single lead by ID
 * @route   GET /leads/:id
 * @access  crm.leads.read (404 outside the organization, 403 outside own scope)
 */
const getLeadById = async (req, res) => {
  try {
    const { organizationId, userId } = tenantOf(req);
    const id = parseId(req.params.id);
    if (id === null) {
      return res.status(404).json({ success: false, message: 'Lead not found' });
    }

    const result = await pool.query(
      `SELECT l.id, l.full_name, l.mobile_number, l.alternate_number, l.email, l.source, l.notes, l.age,
              l.address, l.occupation, l.monthly_income, l.is_aware_of_digital_gold, l.status, l.next_call_at,
              l.created_by, l.assigned_to, l.location_id, l.created_at, l.updated_at,
              u.full_name AS assigned_user_name,
              loc.name AS location_name
       FROM leads l
       LEFT JOIN users u ON l.assigned_to = u.id
       LEFT JOIN sales_locations loc ON l.location_id = loc.id AND loc.organization_id = l.organization_id
       WHERE l.id = $1 AND l.organization_id = $2`,
      [id, organizationId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Lead not found'
      });
    }

    const lead = result.rows[0];
    if (scopeFor(req, 'crm.leads.read') !== 'organization' && !isOwnLead(lead, userId)) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to view this lead'
      });
    }

    res.status(200).json({
      success: true,
      lead
    });
  } catch (error) {
    return serverError(res, 'Error fetching lead', error);
  }
};

export {
  createLead,
  getLeads,
  getLeadById,
  assignLead,
  updateLead,
  createFollowup,
  OWN_LEAD,
  isOwnLead
};
