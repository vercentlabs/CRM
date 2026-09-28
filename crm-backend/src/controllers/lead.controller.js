import pool from '../config/db.js';
import { withTransaction } from '../utils/dbTransaction.js';
import { logAuditEvent } from '../utils/auditLogger.js';

/**
 * Create a new lead
 * @route   POST /leads
 * @desc    Create a new lead with provided information
 * @access  Private
 */
const createLead = async (req, res) => {
  try {
    // Extract all lead fields from request body
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

    // Get user information from the request
    const { roleId: role, userId } = req.user;



    // Validate required fields
    if (!full_name || !mobile_number) {
      return res.status(400).json({
        success: false,
        message: 'Full name and mobile number are required'
      });
    }

    // Validate name (must be a non-empty string)
    if (typeof full_name !== 'string' || full_name.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Full name must be a non-empty string'
      });
    }

    // Validate phone number (must be a string with only digits, exactly 10 characters)
    if (typeof mobile_number !== 'string' || !/^\d{10}$/.test(mobile_number)) {
      return res.status(400).json({
        success: false,
        message: 'Mobile number must be a string of exactly 10 digits'
      });
    }

    // Validate alternate phone number if provided (must be a string with only digits, exactly 10 characters)
    if (alternate_number && (typeof alternate_number !== 'string' || !/^\d{10}$/.test(alternate_number))) {
      return res.status(400).json({
        success: false,
        message: 'Alternate number must be a string of exactly 10 digits'
      });
    }

    // Validate email if provided (must be a valid email format)
    if (email && (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
      return res.status(400).json({
        success: false,
        message: 'Email must be a valid email address'
      });
    }

    // Validate status if provided (must be a string and one of allowed values)
    const validStatuses = ['New', 'Contacted', 'Qualified', 'Converted', 'Lost'];
    
    // Log status value for debugging

    
    // Trim status if it's a string
    const trimmedStatus = typeof status === 'string' ? status.trim() : status;
    
    // Validate status if provided (must be a string and one of allowed values)
    if (trimmedStatus && !validStatuses.includes(trimmedStatus)) {

      return res.status(400).json({
        success: false,
        message: 'Status must be one of: New, Contacted, Qualified, Converted, Lost'
      });
    }
    
    // Use trimmed status or default to 'New'
    const finalStatus = trimmedStatus || 'New';


    // Validate source if provided (must be a string and one of allowed values)
    const validSources = ['website', 'referral', 'social_media', 'email_campaign', 'cold_call', 'event', 'other'];
    if (source && (typeof source !== 'string' || !validSources.includes(source))) {
      return res.status(400).json({
        success: false,
        message: 'Source must be one of: website, referral, social_media, email_campaign, cold_call, event, other'
      });
    }

    // Check role-based assignment rules
    let finalAssignedTo = null;

    if (role === 3) { // Sales role (corrected)
      // For sales users, assigned_to must be null or same as userId
      if (assigned_to && assigned_to !== userId) {
        return res.status(403).json({
          success: false,
          message: 'Sales users can only assign leads to themselves'
        });
      }
      finalAssignedTo = assigned_to || userId;
    } else if (role === 1 || role === 2) { // Admin or Manager (corrected)
      // For admin or manager, allow any assigned_to value
      finalAssignedTo = assigned_to || null;
    }

    // Insert all fields into leads table, using NULL for missing optional fields
    const query = `
      INSERT INTO leads (
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
        created_by,
        assigned_to,
        location_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      RETURNING id
    `;

    // Handle optional fields by using NULL if they're not provided
    const values = [
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
      userId, // created_by
      finalAssignedTo, // assigned_to
      location_id || null
    ];

    try {
      const results = await pool.query(query, values);

      // Log lead creation
      await logAuditEvent(
        userId,
        'CREATE_LEAD',
        'leads',
        results.rows[0].id,
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
          location_id
        },
        req.ip,
        req.get('User-Agent')
      );

      // Fetch the complete lead object with all fields
      const leadQuery = `
        SELECT 
          id,
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
          created_by,
          assigned_to,
          location_id,
          created_at,
          updated_at
        FROM leads
        WHERE id = $1
      `;
      const leadResult = await pool.query(leadQuery, [results.rows[0].id]);
      
      // Return the complete lead object
      res.status(201).json({
        message: 'Lead created successfully',
        lead: leadResult.rows[0]
      });
    } catch (error) {

      
      // Check for specific database constraint violations
      if (error.code === '23514') { // Check constraint violation
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
        } else {
          return res.status(400).json({
            success: false,
            message: `Database constraint violation: ${error.constraint}`
          });
        }
      }
      
      res.status(500).json({
        success: false,
        message: 'Error creating lead',
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
 * Get all leads
 * @route   GET /leads
 * @desc    Get all leads based on user role
 * @access  Private
 */
const getLeads = async (req, res) => {
  try {
    const { roleId: role, userId } = req.user;
    
    // Pagination parameters with defaults and max limit
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100); // Default 20, max 100
    const offset = (page - 1) * limit;

    // Filter parameters
    const { status, assignedTo, dateFrom, dateTo } = req.query;
    
    // Build WHERE conditions based on filters
    const whereConditions = [];
    const filterParams = [];
    let paramIndex = 1; // Start from 1 for PostgreSQL parameter indexing

    // Add status filter if provided
    if (status) {
      whereConditions.push(`status = $${paramIndex++}`);
      filterParams.push(status);
    }

    // Add assignedTo filter if provided
    if (assignedTo) {
      whereConditions.push(`assigned_to = $${paramIndex++}`);
      filterParams.push(assignedTo);
    }

    // Add date range filter if provided
    if (dateFrom) {
      try {
        const parsedDateFrom = new Date(dateFrom);
        if (isNaN(parsedDateFrom.getTime())) {
          throw new Error('Invalid date');
        }
        whereConditions.push(`created_at::date >= $${paramIndex++}`);
        filterParams.push(dateFrom);
      } catch (error) {
        return res.status(400).json({
          success: false,
          message: 'Invalid dateFrom format. Please use YYYY-MM-DD format.'
        });
      }
    }

    if (dateTo) {
      try {
        // Add one day to include all records from the selected date
        const dateToPlusOne = new Date(dateTo);
        dateToPlusOne.setDate(dateToPlusOne.getDate() + 1);
        whereConditions.push(`created_at::date < $${paramIndex++}`);
        filterParams.push(dateToPlusOne.toISOString().split('T')[0]);
      } catch (error) {
        return res.status(400).json({
          success: false,
          message: 'Invalid dateTo format. Please use YYYY-MM-DD format.'
        });
      }
    }

    // Build the WHERE clause for main query (with alias l)
    const mainWhereConditions = whereConditions.map(cond => 
      cond.replace(/\bcreated_at\b/g, 'l.created_at')
    );
    const mainWhereClause = mainWhereConditions.length > 0 ? `WHERE ${mainWhereConditions.join(' AND ')}` : '';

    // Build the WHERE clause for count query (without alias)
    const countWhereConditions = whereConditions.map(cond => 
      cond.replace(/\bcreated_at\b/g, 'leads.created_at')
    );
    const countWhereClause = countWhereConditions.length > 0 ? `WHERE ${countWhereConditions.join(' AND ')}` : '';

    // Keep old whereClause for backward compatibility with Sales role
    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    let query;
    let queryParams = [];
    let countQuery;
    let countParams = [];

    if (role === 1) { // Admin - can see all leads
      query = `
        SELECT l.id, l.full_name AS name, l.email, l.mobile_number, l.alternate_number, l.source, l.notes, l.age, l.address, l.occupation, l.monthly_income, l.is_aware_of_digital_gold, l.status, l.next_call_at, l.created_by, l.assigned_to, l.location_id, l.created_at, l.updated_at, u.full_name AS assigned_user_name
        FROM leads l
        LEFT JOIN users u ON l.assigned_to = u.id
        ${mainWhereClause}
        ORDER BY l.created_at DESC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `;
      paramIndex += 2;
      queryParams = [...filterParams, limit, offset];
      
      countQuery = `SELECT COUNT(id) FROM leads ${countWhereClause}`;
      countParams = [...filterParams];
    } else if (role === 3) { // Sales - can see only their assigned leads or unassigned leads they created
      const salesWhereClause = whereConditions.length > 0 
        ? `WHERE (l.assigned_to = $${paramIndex} OR (l.assigned_to IS NULL AND l.created_by = $${paramIndex + 1})) AND ${mainWhereConditions.join(' AND ')}`
        : `WHERE l.assigned_to = $${paramIndex} OR (l.assigned_to IS NULL AND l.created_by = $${paramIndex + 1})`;
      paramIndex += 2;
      
      query = `
        SELECT l.id, l.full_name AS name, l.email, l.mobile_number, l.alternate_number, l.source, l.notes, l.age, l.address, l.occupation, l.monthly_income, l.is_aware_of_digital_gold, l.status, l.next_call_at, l.created_by, l.assigned_to, l.location_id, l.created_at, l.updated_at, u.full_name AS assigned_user_name
        FROM leads l
        LEFT JOIN users u ON l.assigned_to = u.id
        ${salesWhereClause}
        ORDER BY l.created_at DESC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `;
      paramIndex += 2;
      queryParams = [userId, userId, ...filterParams, limit, offset];
      
      const salesCountWhereClause = whereConditions.length > 0 
        ? `WHERE (assigned_to = $1 OR (assigned_to IS NULL AND created_by = $2)) AND ${countWhereConditions.join(' AND ')}`
        : `WHERE assigned_to = $1 OR (assigned_to IS NULL AND created_by = $2)`;
      countQuery = `SELECT COUNT(id) FROM leads ${salesCountWhereClause}`;
      countParams = [userId, userId, ...filterParams];
    } else if (role === 2) { // Manager - can see all leads (corrected)
      query = `
        SELECT l.id, l.full_name AS name, l.email, l.mobile_number, l.alternate_number, l.source, l.notes, l.age, l.address, l.occupation, l.monthly_income, l.is_aware_of_digital_gold, l.status, l.next_call_at, l.created_by, l.assigned_to, l.location_id, l.created_at, l.updated_at, u.full_name AS assigned_user_name
        FROM leads l
        LEFT JOIN users u ON l.assigned_to = u.id
        ${mainWhereClause}
        ORDER BY l.created_at DESC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `;
      paramIndex += 2;
      queryParams = [...filterParams, limit, offset];
      
      countQuery = `SELECT COUNT(id) FROM leads ${countWhereClause}`;
      countParams = [...filterParams];
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
      res.status(500).json({
        message: 'Error retrieving leads',
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
 * Assign a lead to a sales user
 * @route   PATCH /leads/:leadId/assign
 * @desc    Assign a lead to a sales user
 * @access  Private (Admin only)
 */
const assignLead = async (req, res) => {
  try {
    const { leadId } = req.params;
    const { assigned_to: salesUserId } = req.body;

    // Use transaction helper for all related database operations
    await withTransaction(async (client) => {
      // Check if lead exists and get current assignment
      const checkLeadQuery = 'SELECT id, assigned_to FROM leads WHERE id = $1 FOR UPDATE';
      const leadResult = await client.query(checkLeadQuery, [leadId]);

      if (leadResult.rows.length === 0) {
        throw new Error('Lead not found');
      }

      // Store old assignment value for audit logging
      const oldAssignment = leadResult.rows[0].assigned_to;

      // Update lead assignment
      const updateQuery = 'UPDATE leads SET assigned_to = $1 WHERE id = $2';
      const updateResult = await client.query(updateQuery, [salesUserId, leadId]);
      
      // Check if the update actually affected any rows
      if (updateResult.rowCount === 0) {
        throw new Error('Failed to update lead assignment');
      }

      // Log assignment change
      await logAuditEvent(
        req.user.userId,
        'ASSIGN_LEAD',
        'leads',
        leadId,
        { assigned_to: oldAssignment },
        { assigned_to: salesUserId, changed_by: req.user.userId },
        req.ip,
        req.get('User-Agent')
      );
    });

    res.status(200).json({
      message: 'Lead assigned successfully',
      leadId,
      assignedTo: salesUserId
    });
  } catch (error) {
    // Handle specific errors
    if (error.message === 'Lead not found') {
      return res.status(404).json({
        success: false,
        message: 'Lead not found'
      });
    }
    
    // Generic error response
    res.status(500).json({
      success: false,
      message: 'Error assigning lead',
      error: error.message
    });
  }
};

/**
 * Update a lead
 * @route   PUT /leads/:id
 * @desc    Update lead details
 * @access  Private
 */
const updateLead = async (req, res) => {
  try {
    const leadId = req.params.id; // Using id for PUT /leads/:id route
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
    const { userId } = req.user;

    // Check if lead exists and get current status
    const checkLeadQuery = 'SELECT id, assigned_to, status FROM leads WHERE id = $1';
    const results = await pool.query(checkLeadQuery, [leadId]);

    if (results.rows.length === 0) {
      return res.status(404).json({
        message: 'Lead not found'
      });
    }

    // Check if lead is assigned to the current user
    const lead = results.rows[0];
    const { roleId: role } = req.user;

    // Store old status for audit logging
    const oldStatus = lead.status;

    // Allow admins and managers to update any lead
    // Sales users can only update leads assigned to them
    if (role === 3 && lead.assigned_to !== userId) {
      return res.status(403).json({
        message: 'You cannot update leads assigned to another sales executive'
      });
    }

      // Update allowed fields
      const updateFields = [];
      const updateValues = [];
      let paramIndex = 1;

      if (status !== undefined) {
        updateFields.push(`status = $${paramIndex++}`);
        updateValues.push(status);
      }

      if (notes !== undefined) {
        updateFields.push(`notes = $${paramIndex++}`);
        updateValues.push(notes);
      }

      if (next_call_at !== undefined) {
        updateFields.push(`next_call_at = $${paramIndex++}`);
        updateValues.push(next_call_at);
      }

      if (location_id !== undefined) {
        updateFields.push(`location_id = $${paramIndex++}`);
        updateValues.push(location_id);
      }

      if (assigned_to !== undefined) {
        // Validate assigned_to based on role
        if (role === 3 && assigned_to !== userId) {
          return res.status(403).json({
            message: 'Sales users can only assign leads to themselves'
          });
        }
        updateFields.push(`assigned_to = $${paramIndex++}`);
        updateValues.push(assigned_to);
      }

      if (age !== undefined) {
        // Validate age
        if (age !== null && (typeof age !== 'number' || age < 18 || age > 100)) {
          return res.status(400).json({
            message: 'Age must be between 18 and 100'
          });
        }
        updateFields.push(`age = $${paramIndex++}`);
        updateValues.push(age);
      }

      if (occupation !== undefined) {
        updateFields.push(`occupation = $${paramIndex++}`);
        updateValues.push(occupation);
      }

      if (monthly_income !== undefined) {
        updateFields.push(`monthly_income = $${paramIndex++}`);
        updateValues.push(monthly_income);
      }

      if (is_aware_of_digital_gold !== undefined) {
        updateFields.push(`is_aware_of_digital_gold = $${paramIndex++}`);
        updateValues.push(is_aware_of_digital_gold);
      }

      if (full_name !== undefined) {
        updateFields.push(`full_name = $${paramIndex++}`);
        updateValues.push(full_name);
      }

      if (mobile_number !== undefined) {
        updateFields.push(`mobile_number = $${paramIndex++}`);
        updateValues.push(mobile_number);
      }

      if (alternate_number !== undefined) {
        updateFields.push(`alternate_number = $${paramIndex++}`);
        updateValues.push(alternate_number);
      }

      if (email !== undefined) {
        updateFields.push(`email = $${paramIndex++}`);
        updateValues.push(email);
      }

      if (address !== undefined) {
        updateFields.push(`address = $${paramIndex++}`);
        updateValues.push(address);
      }

      if (source !== undefined) {
        updateFields.push(`source = $${paramIndex++}`);
        updateValues.push(source);
      }

      if (updateFields.length === 0) {
        return res.status(400).json({
          message: 'No valid fields to update'
        });
      }

      updateValues.push(leadId);

      const updateQuery = `
        UPDATE leads
        SET ${updateFields.join(', ')}
        WHERE id = $${paramIndex}
      `;

    try {
      await pool.query(updateQuery, updateValues);

      // Log status change if status was updated
      if (status !== undefined && status !== oldStatus) {
        try {
          await logAuditEvent(
            userId,
            'UPDATE_LEAD_STATUS',
            'leads',
            leadId,
            { status: oldStatus },
            { status: status, updated_by: userId },
            req.ip,
            req.get('User-Agent')
          );
        } catch (auditError) {

          // Continue with the update even if audit logging fails
        }
        
        // If status is changed to 'Converted', convert lead to customer
        if (status === 'Converted') {
          // Get full lead details
          const leadDetailsQuery = 'SELECT * FROM leads WHERE id = $1';
          const leadDetailsResult = await pool.query(leadDetailsQuery, [leadId]);
          const leadDetails = leadDetailsResult.rows[0];
          
          // Check if customer already exists with this email
          const existingCustomerQuery = 'SELECT id FROM customers WHERE email = $1';
          const existingCustomerResult = await pool.query(existingCustomerQuery, [leadDetails.email]);
          
          if (existingCustomerResult.rows.length === 0) {
            // Create new customer from lead
            const insertCustomerQuery = `
              INSERT INTO customers (name, email, phone, address, assigned_to, created_by)
              VALUES ($1, $2, $3, $4, $5, $6)
              RETURNING *
            `;
            
            const customerValues = [
              leadDetails.full_name,
              leadDetails.email,
              leadDetails.mobile_number,
              leadDetails.address,
              leadDetails.assigned_to,
              userId
            ];
            
            const customerResult = await pool.query(insertCustomerQuery, customerValues);
            const newCustomer = customerResult.rows[0];
            
            // Log the conversion
            await logAuditEvent(
              userId,
              'LEAD_CONVERTED_TO_CUSTOMER',
              'customers',
              newCustomer.id,
              null,
              {
                leadId: leadId,
                name: newCustomer.name,
                email: newCustomer.email,
                assignedTo: newCustomer.assigned_to
              },
              req.ip,
              req.get('User-Agent')
            );
          }
        }
      }

      res.status(200).json({
        message: 'Lead updated successfully',
        leadId,
        updatedFields: updateFields.map(field => field.split(' = ')[0])
      });
    } catch (error) {

      res.status(500).json({
        message: 'Error updating lead',
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
 * Create a followup for a lead
 * @route   POST /leads/:leadId/followups
 * @desc    Create a followup for a lead
 * @access  Private (Sales only)
 */
const createFollowup = async (req, res) => {
  try {
    // Extract leadId from route parameter
    const { leadId } = req.params;
    const { scheduled_at, followup_type, notes } = req.body;
    const { userId, roleId: role } = req.user;


    // Validate required fields
    if (!leadId || !scheduled_at) {
      return res.status(400).json({
        success: false,
        message: 'scheduled_at is required'
      });
    }

    // Validate leadId is numeric
    if (isNaN(leadId)) {
      return res.status(400).json({
        success: false,
        message: 'leadId must be a numeric value'
      });
    }

    // Validate scheduled_at is a future datetime
    const scheduledDate = new Date(scheduled_at);
    const now = new Date();
    if (isNaN(scheduledDate.getTime()) || scheduledDate <= now) {
      return res.status(400).json({
        success: false,
        message: 'scheduled_at must be a valid future datetime'
      });
    }

    // Role check is already handled by the isSales middleware

    // Use transaction helper for all related database operations
    const { followup, lead } = await withTransaction(async (client) => {
      // Check if lead exists
      const checkLeadQuery = 'SELECT id, assigned_to FROM leads WHERE id = $1 FOR UPDATE';
      const leadResult = await client.query(checkLeadQuery, [leadId]);

      if (leadResult.rows.length === 0) {
        throw new Error('Lead not found');
      }

      // Check if lead is assigned to current user
      const lead = leadResult.rows[0];
      if (lead.assigned_to !== userId) {
        throw new Error('You can only create followups for leads assigned to you');
      }

      // Insert followup
      const insertFollowupQuery = 'INSERT INTO followups (lead_id, assigned_to, followup_date, followup_type, status, notes) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *';
      

      const followupResult = await client.query(insertFollowupQuery, [leadId, userId, scheduled_at, followup_type || 'Call', 'Pending', notes]);
      

      // Update lead's next_call_at
      const updateLeadQuery = 'UPDATE leads SET next_call_at = $1 WHERE id = $2 RETURNING *';
      const updateResults = await client.query(updateLeadQuery, [scheduled_at, leadId]);

      // Log follow-up creation
      await logAuditEvent(
        userId,
        'CREATE_FOLLOWUP',
        'followups',
        followupResult.rows[0].id,
        null,
        {
          lead_id: leadId,
          scheduled_at: scheduled_at,
          created_by: userId,
          timestamp: new Date().toISOString()
        },
        req.ip,
        req.get('User-Agent')
      );

      return {
        followup: followupResult.rows[0],
        lead: updateResults.rows[0]
      };
    });


    res.status(201).json({
      message: 'Followup created successfully',
      followup,
      lead
    });
  } catch (error) {
    // Handle specific errors
    if (error.message === 'Lead not found') {
      return res.status(404).json({
        success: false,
        message: 'Lead not found'
      });
    }
    
    if (error.message === 'You can only create followups for leads assigned to you') {
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
  }
};

/**
 * Get followups based on user role
 * @route   GET /followups
 * @desc    Get followups based on user role
 * @access  Private
 */
const getFollowups = async (req, res) => {
  try {
    const { userId, roleId: role } = req.user;
    let query = `
      SELECT f.*, l.full_name as lead_full_name
      FROM followups f
      JOIN leads l ON f.lead_id = l.id
    `;

    let queryParams = [];

    // Role-based filtering
    if (role === 3) { // Sales - only their own followups
      query += ' WHERE f.user_id = $1';
      queryParams.push(userId);
    }
    // For Manager (2) and Admin (1), no WHERE clause needed - they can see all followups

    // Order by followup_date
    query += ' ORDER BY f.followup_date ASC';

    try {
      const results = await pool.query(query, queryParams);
      res.status(200).json({
        message: 'Followups retrieved successfully',
        followups: results.rows
      });
    } catch (error) {
      res.status(500).json({
        message: 'Error retrieving followups',
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
 * Get overdue followups based on user role
 * @route   GET /followups/overdue
 * @desc    Get overdue followups based on user role
 * @access  Private
 */
const getOverdueFollowups = async (req, res) => {
  try {
    const { userId, roleId: role } = req.user;
    let query = `
      SELECT f.*, l.full_name as lead_full_name
      FROM followups f
      JOIN leads l ON f.lead_id = l.id
      WHERE f.followup_date < NOW() AND f.status = 'Pending' 
    `;

    let queryParams = [];

    // Role-based filtering
    if (role === 3) { // Sales - only their own followups
      query += ' AND f.user_id = $1';
      queryParams.push(userId);
    }
    // For Manager (2) and Admin (1), no additional WHERE clause needed - they can see all overdue followups

    // Order by scheduled_at (oldest first)
    query += ' ORDER BY f.scheduled_at ASC';

    try {
      const results = await pool.query(query, queryParams);
      res.status(200).json({
        message: 'Overdue followups retrieved successfully',
        followups: results.rows
      });
    } catch (error) {
      res.status(500).json({
        message: 'Error retrieving overdue followups',
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
 * Complete a followup
 * @route   PATCH /followups/:id/complete
 * @desc    Mark a followup as completed
 * @access  Private (Sales only)
 */
const completeFollowup = async (req, res) => {
  try {
    const { userId, roleId: role } = req.user;
    const { id: followupId } = req.params;

    // Only sales users can complete followups
    if (role !== 3) {
      return res.status(403).json({
        message: 'Only sales users can complete followups'
      });
    }

    // First check if the followup exists and belongs to the user
    const checkQuery = 'SELECT user_id FROM followups WHERE id = $1';
    try {
      const checkResults = await pool.query(checkQuery, [followupId]);

      if (checkResults.rows.length === 0) {
        return res.status(404).json({
          message: 'Followup not found'
        });
      }

      // Check if the followup belongs to the user
      if (checkResults.rows[0].user_id !== userId) {
        return res.status(403).json({
          message: 'You can only complete your own followups'
        });
      }

      // Update the followup as completed
      const updateQuery = "UPDATE followups SET status = 'Completed', completed_at = NOW() WHERE id = $1";
      try {
        await pool.query(updateQuery, [followupId]);

        // Log followup completion
        await logAuditEvent(
          userId,
          'COMPLETE_FOLLOWUP',
          'followups',
          followupId,
          { status: 'Pending' },
          { status: 'Completed', completed_at: new Date().toISOString() },
          req.ip,
          req.get('User-Agent')
        );

        res.status(200).json({
          message: 'Followup completed successfully'
        });
      } catch (updateError) {
        res.status(500).json({
          message: 'Error completing followup',
          error: updateError.message
        });
      }
    } catch (checkError) {
      res.status(500).json({
        message: 'Error checking followup',
        error: checkError.message
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
 * Get a single lead by ID
 * @route   GET /leads/:id
 * @desc    Get a single lead by ID
 * @access  Private
 */
const getLeadById = async (req, res) => {
  try {
    const { id } = req.params;
    const { userId, roleId: role } = req.user;

    // Query to get lead details
    const query = `
      SELECT
        l.id,
        l.full_name,
        l.mobile_number,
        l.alternate_number,
        l.email,
        l.source,
        l.notes,
        l.age,
        l.address,
        l.occupation,
        l.monthly_income,
        l.is_aware_of_digital_gold,
        l.status,
        l.next_call_at,
        l.created_by,
        l.assigned_to,
        l.location_id,
        l.created_at,
        l.updated_at,
        u.full_name as assigned_user_name,
        loc.name as location_name
      FROM leads l
      LEFT JOIN users u ON l.assigned_to = u.id
      LEFT JOIN sales_locations loc ON l.location_id = loc.id
      WHERE l.id = $1
    `;

    const result = await pool.query(query, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Lead not found'
      });
    }

    const lead = result.rows[0];

    // Check if user has permission to view this lead
    // Admin and Manager can view all leads
    // Sales users can only view leads assigned to them
    if (role === 3 && lead.assigned_to !== userId) {
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

    res.status(500).json({
      success: false,
      message: 'Error fetching lead',
      error: error.message
    });
  }
};

export {
  createLead,
  getLeads,
  getLeadById,
  assignLead,
  updateLead,
  createFollowup,
  getFollowups,
  getOverdueFollowups,
  completeFollowup
};
