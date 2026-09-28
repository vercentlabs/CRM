import pool from '../config/db.js';
import { sendSuccess, sendError, sendValidationError } from '../utils/response.js';
import { logAuditEvent } from '../utils/auditLogger.js';
import { isActiveMember, parseId, scopeFor, serverError, tenantOf } from '../platform/tenancy.js';

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Resolves the assignee for a customer write. Own-scope members may only
 * assign to themselves (default); others may assign to any active member.
 */
const resolveAssignee = async (req, permission, assignedTo) => {
  const { organizationId, userId } = tenantOf(req);
  const requested = assignedTo === undefined || assignedTo === null || assignedTo === '' ? null : parseId(assignedTo);
  if (assignedTo && requested === null) return { error: 'Assigned user is not a member of this organization' };
  if (scopeFor(req, permission) !== 'organization') {
    if (requested !== null && requested !== userId) {
      return { error: 'You can only assign customers to yourself', status: 403 };
    }
    return { assignee: userId };
  }
  if (requested !== null && !(await isActiveMember(organizationId, requested))) {
    return { error: 'Assigned user is not a member of this organization' };
  }
  return { assignee: requested };
};

// Get customers (own scope: customers assigned to me)
export const getCustomers = async (req, res) => {
  try {
    const { organizationId, userId } = tenantOf(req);
    const params = [organizationId];
    let query = 'SELECT * FROM customers WHERE organization_id = $1';

    if (scopeFor(req, 'crm.customers.read') !== 'organization') {
      params.push(userId);
      query += ` AND assigned_to = $${params.length}`;
    }

    query += ' ORDER BY created_at DESC';
    const result = await pool.query(query, params);

    return sendSuccess(res, 'Customers retrieved successfully', {
      customers: result.rows
    });
  } catch (error) {
    return serverError(res, 'Failed to fetch customers', error);
  }
};

// Create a new customer (inside the caller's organization)
export const createCustomer = async (req, res) => {
  try {
    const { organizationId, userId } = tenantOf(req);
    const { name, email, phone, address, assignedTo } = req.body;

    if (!name || !email) {
      return sendValidationError(res, [
        { field: name ? 'email' : 'name', message: `${name ? 'Email' : 'Name'} is required` }
      ]);
    }

    if (!emailRegex.test(email)) {
      return sendValidationError(res, [
        { field: 'email', message: 'Invalid email format' }
      ]);
    }

    const assignment = await resolveAssignee(req, 'crm.customers.create', assignedTo);
    if (assignment.error) return sendError(res, assignment.error, assignment.status ?? 400);

    // Customer emails are unique per organization (not globally).
    const existingCustomer = await pool.query(
      'SELECT id FROM customers WHERE organization_id = $1 AND email = $2',
      [organizationId, email]
    );
    if (existingCustomer.rows.length > 0) {
      return sendError(res, 'A customer with this email already exists', 409);
    }

    const result = await pool.query(
      `INSERT INTO customers (organization_id, name, email, phone, address, assigned_to, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [organizationId, name, email, phone || null, address || null, assignment.assignee, userId]
    );
    const newCustomer = result.rows[0];

    await logAuditEvent(
      userId,
      'CUSTOMER_CREATED',
      'customers',
      newCustomer.id,
      null,
      {
        name: newCustomer.name,
        email: newCustomer.email,
        assignedTo: newCustomer.assigned_to
      }
    );

    return sendSuccess(res, 'Customer created successfully', {
      customer: newCustomer
    });
  } catch (error) {
    if (error.code === '23505') return sendError(res, 'A customer with this email already exists', 409);
    return serverError(res, 'Failed to create customer', error);
  }
};

// Update a customer (404 outside the organization; own scope: assigned to me)
export const updateCustomer = async (req, res) => {
  try {
    const { organizationId, userId } = tenantOf(req);
    const id = parseId(req.params.id);
    const { name, email, phone, address, assignedTo } = req.body;

    if (!name || !email) {
      return sendValidationError(res, [
        { field: name ? 'email' : 'name', message: `${name ? 'Email' : 'Name'} is required` }
      ]);
    }

    if (!emailRegex.test(email)) {
      return sendValidationError(res, [
        { field: 'email', message: 'Invalid email format' }
      ]);
    }

    if (id === null) return sendError(res, 'Customer not found', 404);

    const customerResult = await pool.query(
      'SELECT * FROM customers WHERE id = $1 AND organization_id = $2',
      [id, organizationId]
    );
    if (customerResult.rows.length === 0) {
      return sendError(res, 'Customer not found', 404);
    }

    const existingCustomer = customerResult.rows[0];
    if (scopeFor(req, 'crm.customers.update') !== 'organization' && existingCustomer.assigned_to !== userId) {
      return sendError(res, 'You can only update customers assigned to you', 403);
    }

    const assignment = await resolveAssignee(req, 'crm.customers.update', assignedTo);
    if (assignment.error) return sendError(res, assignment.error, assignment.status ?? 400);

    if (existingCustomer.email !== email) {
      const emailCheckResult = await pool.query(
        'SELECT id FROM customers WHERE organization_id = $1 AND email = $2 AND id != $3',
        [organizationId, email, id]
      );
      if (emailCheckResult.rows.length > 0) {
        return sendError(res, 'A customer with this email already exists', 409);
      }
    }

    const result = await pool.query(
      `UPDATE customers
       SET name = $1, email = $2, phone = $3, address = $4, assigned_to = $5, updated_at = NOW()
       WHERE id = $6 AND organization_id = $7
       RETURNING *`,
      [name, email, phone || null, address || null, assignment.assignee, id, organizationId]
    );
    const updatedCustomer = result.rows[0];

    await logAuditEvent(
      userId,
      'CUSTOMER_UPDATED',
      'customers',
      updatedCustomer.id,
      existingCustomer,
      {
        name: updatedCustomer.name,
        email: updatedCustomer.email,
        assignedTo: updatedCustomer.assigned_to
      }
    );

    return sendSuccess(res, 'Customer updated successfully', {
      customer: updatedCustomer
    });
  } catch (error) {
    if (error.code === '23505') return sendError(res, 'A customer with this email already exists', 409);
    return serverError(res, 'Failed to update customer', error);
  }
};

// Delete a customer (404 outside the organization)
export const deleteCustomer = async (req, res) => {
  try {
    const { organizationId, userId } = tenantOf(req);
    const id = parseId(req.params.id);
    if (id === null) return sendError(res, 'Customer not found', 404);

    const deleted = await pool.query(
      'DELETE FROM customers WHERE id = $1 AND organization_id = $2 RETURNING *',
      [id, organizationId]
    );
    if (deleted.rows.length === 0) {
      return sendError(res, 'Customer not found', 404);
    }

    const customer = deleted.rows[0];
    await logAuditEvent(userId, 'CUSTOMER_DELETED', 'customers', customer.id, customer, null);

    return sendSuccess(res, 'Customer deleted successfully');
  } catch (error) {
    return serverError(res, 'Failed to delete customer', error);
  }
};
