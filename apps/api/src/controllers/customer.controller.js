import pool from '../config/db.js';
import { sendSuccess, sendError, sendValidationError } from '../utils/response.js';
import { logAuditEvent } from '../utils/auditLogger.js';

// Get all customers
export const getCustomers = async (req, res) => {
  try {
    // For sales users, only return customers assigned to them
    // For admin and manager, return all customers
    let query = 'SELECT * FROM customers';
    const params = [];

    // If user is sales (role_id = 3), only get their assigned customers
    if (req.user.roleId === 3) {
      query += ' WHERE assigned_to = $1';
      params.push(req.user.userId);
    }

    query += ' ORDER BY created_at DESC';

    const result = await pool.query(query, params);

    return sendSuccess(res, 'Customers retrieved successfully', {
      customers: result.rows
    });
  } catch (error) {
    console.error('Error fetching customers:', error);
    return sendError(res, 'Failed to fetch customers', 500, error.message);
  }
};

// Create a new customer
export const createCustomer = async (req, res) => {
  try {
    const { name, email, phone, address, assignedTo } = req.body;

    // Validate input
    if (!name || !email) {
      return sendValidationError(res, [
        { field: name ? 'email' : 'name', message: `${name ? 'Email' : 'Name'} is required` }
      ]);
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return sendValidationError(res, [
        { field: 'email', message: 'Invalid email format' }
      ]);
    }

    // Check if customer with this email already exists
    const existingCustomerQuery = 'SELECT id FROM customers WHERE email = $1';
    const existingCustomer = await pool.query(existingCustomerQuery, [email]);

    if (existingCustomer.rows.length > 0) {
      return sendError(res, 'A customer with this email already exists', 409);
    }

    // Insert new customer
    const insertQuery = `
      INSERT INTO customers (name, email, phone, address, assigned_to, created_by)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;

    const values = [
      name,
      email,
      phone || null,
      address || null,
      assignedTo || null,
      req.user.userId
    ];

    const result = await pool.query(insertQuery, values);
    const newCustomer = result.rows[0];

    // Log the creation
    await logAuditEvent(
      req.user.userId,
      'CUSTOMER_CREATED',
      'customers',
      newCustomer.id,
      null,
      {
        name: newCustomer.name,
        email: newCustomer.email,
        assignedTo: newCustomer.assigned_to
      },
      req.ip,
      req.get('User-Agent')
    );

    return sendSuccess(res, 'Customer created successfully', {
      customer: newCustomer
    });
  } catch (error) {
    console.error('Error creating customer:', error);
    return sendError(res, 'Failed to create customer', 500, error.message);
  }
};

// Update a customer
export const updateCustomer = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, phone, address, assignedTo } = req.body;

    // Validate input
    if (!name || !email) {
      return sendValidationError(res, [
        { field: name ? 'email' : 'name', message: `${name ? 'Email' : 'Name'} is required` }
      ]);
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return sendValidationError(res, [
        { field: 'email', message: 'Invalid email format' }
      ]);
    }

    // Check if customer exists
    const customerQuery = 'SELECT * FROM customers WHERE id = $1';
    const customerResult = await pool.query(customerQuery, [id]);

    if (customerResult.rows.length === 0) {
      return sendError(res, 'Customer not found', 404);
    }

    // If email is being changed, check if new email already exists
    const existingCustomer = customerResult.rows[0];
    if (existingCustomer.email !== email) {
      const emailCheckQuery = 'SELECT id FROM customers WHERE email = $1 AND id != $2';
      const emailCheckResult = await pool.query(emailCheckQuery, [email, id]);

      if (emailCheckResult.rows.length > 0) {
        return sendError(res, 'A customer with this email already exists', 409);
      }
    }

    // For sales users, only allow updating customers assigned to them
    if (req.user.roleId === 3 && existingCustomer.assigned_to !== req.user.userId) {
      return sendError(res, 'You can only update customers assigned to you', 403);
    }

    // Update customer
    const updateQuery = `
      UPDATE customers 
      SET name = $1, email = $2, phone = $3, address = $4, assigned_to = $5, updated_at = NOW()
      WHERE id = $6
      RETURNING *
    `;

    const values = [
      name,
      email,
      phone || null,
      address || null,
      assignedTo || null,
      id
    ];

    const result = await pool.query(updateQuery, values);
    const updatedCustomer = result.rows[0];

    // Log the update
    await logAuditEvent(
      req.user.userId,
      'CUSTOMER_UPDATED',
      'customers',
      updatedCustomer.id,
      existingCustomer,
      {
        name: updatedCustomer.name,
        email: updatedCustomer.email,
        assignedTo: updatedCustomer.assigned_to
      },
      req.ip,
      req.get('User-Agent')
    );

    return sendSuccess(res, 'Customer updated successfully', {
      customer: updatedCustomer
    });
  } catch (error) {
    console.error('Error updating customer:', error);
    return sendError(res, 'Failed to update customer', 500, error.message);
  }
};

// Delete a customer
export const deleteCustomer = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if customer exists
    const customerQuery = 'SELECT * FROM customers WHERE id = $1';
    const customerResult = await pool.query(customerQuery, [id]);

    if (customerResult.rows.length === 0) {
      return sendError(res, 'Customer not found', 404);
    }

    const customer = customerResult.rows[0];

    // Delete customer
    const deleteQuery = 'DELETE FROM customers WHERE id = $1';
    await pool.query(deleteQuery, [id]);

    // Log the deletion
    await logAuditEvent(
      req.user.userId,
      'CUSTOMER_DELETED',
      'customers',
      customer.id,
      customer,
      null,
      req.ip,
      req.get('User-Agent')
    );

    return sendSuccess(res, 'Customer deleted successfully');
  } catch (error) {
    console.error('Error deleting customer:', error);
    return sendError(res, 'Failed to delete customer', 500, error.message);
  }
};
