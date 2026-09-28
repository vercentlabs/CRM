
import pool from '../config/db.js';
import { logAuditEvent } from '../utils/auditLogger.js';

/**
 * Get tasks based on user role
 * @route   GET /tasks
 * @desc    Get tasks based on user role
 * @access  Private
 */
const getTasks = async (req, res) => {
  try {
    const { userId, roleId: role } = req.user;
    let query = `
      SELECT t.*, u.full_name as assigned_to_name, u.email as assigned_to_email
      FROM tasks t
      LEFT JOIN users u ON t.assigned_to = u.id
    `;

    let queryParams = [];

    // Role-based filtering
    if (role === 3) { // Sales - only their own tasks
      query += ' WHERE t.assigned_to = $1';
      queryParams.push(userId);
    }
    // For Manager (2) and Admin (1), no WHERE clause needed - they can see all tasks

    // Order by due_date
    query += ' ORDER BY t.due_date ASC';

    pool.query(query, queryParams, (error, results) => {
      if (error) {
        return res.status(500).json({
          message: 'Error retrieving tasks',
          error: error.message
        });
      }

      res.status(200).json({
        message: 'Tasks retrieved successfully',
        tasks: results.rows
      });
    });
  } catch (error) {
    res.status(500).json({
      message: 'Server error',
      error: error.message
    });
  }
};

/**
 * Create a new task
 * @route   POST /tasks
 * @desc    Create a new task
 * @access  Private (Admin and Manager only)
 */
const createTask = async (req, res) => {
  try {
    const { userId } = req.user;
    const { title, description, due_date, priority, assigned_to, status } = req.body;

    // Validate required fields
    if (!title || !due_date) {
      return res.status(400).json({
        message: 'Title and due date are required'
      });
    }

    const query = `
      INSERT INTO tasks (title, description, due_date, priority, assigned_to, status, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `;

    const values = [
      title,
      description || null,
      due_date,
      priority || 'medium',
      assigned_to || null,
      status || 'pending',
      userId
    ];

    pool.query(query, values, async (error, results) => {
      if (error) {
        return res.status(500).json({
          message: 'Error creating task',
          error: error.message
        });
      }

      const newTask = results.rows[0];

      // Log task creation
      try {
        await logAuditEvent(
          userId,
          'CREATE_TASK',
          'task',
          newTask.id,
          {
            title: newTask.title,
            assigned_to: newTask.assigned_to,
            due_date: newTask.due_date
          }
        );
      } catch (logError) {
        console.error('Error logging task creation:', logError);
        // Continue with response even if logging fails
      }

      res.status(201).json({
        message: 'Task created successfully',
        task: newTask
      });
    });
  } catch (error) {
    res.status(500).json({
      message: 'Server error',
      error: error.message
    });
  }
};

/**
 * Update a task
 * @route   PATCH /tasks/:id
 * @desc    Update a task
 * @access  Private (Admin, Manager, and assigned user)
 */
const updateTask = async (req, res) => {
  try {
    const { userId, roleId: role } = req.user;
    const { id: taskId } = req.params;
    const { title, description, due_date, priority, assigned_to, status } = req.body;

    // First check if the task exists
    const checkQuery = 'SELECT * FROM tasks WHERE id = $1';
    pool.query(checkQuery, [taskId], (checkError, checkResults) => {
      if (checkError) {
        return res.status(500).json({
          message: 'Error checking task',
          error: checkError.message
        });
      }

      if (checkResults.rows.length === 0) {
        return res.status(404).json({
          message: 'Task not found'
        });
      }

      const task = checkResults.rows[0];

      // Check if user has permission to update the task
      // Admin and Manager can update any task, Sales can only update their own tasks
      if (role === 3 && task.assigned_to !== userId) {
        return res.status(403).json({
          message: 'You can only update your own tasks'
        });
      }

      // Build the update query dynamically based on provided fields
      const updates = [];
      const values = [];
      let paramCount = 1;

      if (title !== undefined) {
        updates.push(`title = $${paramCount++}`);
        values.push(title);
      }
      if (description !== undefined) {
        updates.push(`description = $${paramCount++}`);
        values.push(description);
      }
      if (due_date !== undefined) {
        updates.push(`due_date = $${paramCount++}`);
        values.push(due_date);
      }
      if (priority !== undefined) {
        updates.push(`priority = $${paramCount++}`);
        values.push(priority);
      }
      if (assigned_to !== undefined) {
        updates.push(`assigned_to = $${paramCount++}`);
        values.push(assigned_to);
      }
      if (status !== undefined) {
        updates.push(`status = $${paramCount++}`);
        values.push(status);
      }

      if (updates.length === 0) {
        return res.status(400).json({
          message: 'No fields to update'
        });
      }

      values.push(taskId);
      const updateQuery = `
        UPDATE tasks
        SET ${updates.join(', ')}, updated_at = NOW()
        WHERE id = $${paramCount}
        RETURNING *
      `;

      pool.query(updateQuery, values, async (updateError, updateResults) => {
        if (updateError) {
          return res.status(500).json({
            message: 'Error updating task',
            error: updateError.message
          });
        }

        const updatedTask = updateResults.rows[0];

        // Log task update
        try {
          await logAuditEvent(
            userId,
            'UPDATE_TASK',
            'task',
            updatedTask.id,
            {
              title: updatedTask.title,
              assigned_to: updatedTask.assigned_to,
              status: updatedTask.status
            }
          );
        } catch (logError) {
          console.error('Error logging task update:', logError);
          // Continue with response even if logging fails
        }

        res.status(200).json({
          message: 'Task updated successfully',
          task: updatedTask
        });
      });
    });
  } catch (error) {
    res.status(500).json({
      message: 'Server error',
      error: error.message
    });
  }
};

/**
 * Delete a task
 * @route   DELETE /tasks/:id
 * @desc    Delete a task
 * @access  Private (Admin and Manager only)
 */
const deleteTask = async (req, res) => {
  try {
    const { userId, roleId: role } = req.user;
    const { id: taskId } = req.params;

    // Only Admin and Manager can delete tasks
    if (role !== 1 && role !== 2) {
      return res.status(403).json({
        message: 'Only Admin and Manager can delete tasks'
      });
    }

    // First check if the task exists
    const checkQuery = 'SELECT * FROM tasks WHERE id = $1';
    pool.query(checkQuery, [taskId], (checkError, checkResults) => {
      if (checkError) {
        return res.status(500).json({
          message: 'Error checking task',
          error: checkError.message
        });
      }

      if (checkResults.rows.length === 0) {
        return res.status(404).json({
          message: 'Task not found'
        });
      }

      const task = checkResults.rows[0];

      // Delete the task
      const deleteQuery = 'DELETE FROM tasks WHERE id = $1';
      pool.query(deleteQuery, [taskId], async (deleteError, deleteResults) => {
        if (deleteError) {
          return res.status(500).json({
            message: 'Error deleting task',
            error: deleteError.message
          });
        }

        // Log task deletion
        try {
          await logAuditEvent(
            userId,
            'DELETE_TASK',
            'task',
            taskId,
            {
              title: task.title,
              assigned_to: task.assigned_to
            }
          );
        } catch (logError) {
          console.error('Error logging task deletion:', logError);
          // Continue with response even if logging fails
        }

        res.status(200).json({
          message: 'Task deleted successfully'
        });
      });
    });
  } catch (error) {
    res.status(500).json({
      message: 'Server error',
      error: error.message
    });
  }
};

export {
  getTasks,
  createTask,
  updateTask,
  deleteTask
};
