
import pool from '../config/db.js';

/**
 * Get calendar events based on user role
 * @route   GET /calendar
 * @desc    Get calendar events
 * @access  Private
 */
const getEvents = async (req, res) => {
  try {
    const { userId, roleId: role } = req.user;

    let query = `
      SELECT 
        t.id,
        t.title,
        t.description,
        t.due_date as start_date,
        t.due_date as end_date,
        t.priority,
        t.status,
        t.assigned_to as user_id,
        u.full_name as user_name,
        'task' as event_type
      FROM tasks t
      LEFT JOIN users u ON t.assigned_to = u.id
    `;

    let queryParams = [];

    // Role-based filtering
    if (role === 3) { // Sales - only their own tasks
      query += ' WHERE t.assigned_to = $1';
      queryParams.push(userId);
    }

    // Order by due_date
    query += ' ORDER BY t.due_date ASC';

    pool.query(query, queryParams, (error, results) => {
      if (error) {
        return res.status(500).json({
          message: 'Error retrieving calendar events',
          error: error.message
        });
      }

      res.status(200).json({
        message: 'Events retrieved successfully',
        events: results.rows
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
 * Create a new calendar event
 * @route   POST /calendar
 * @desc    Create a new calendar event
 * @access  Private
 */
const createEvent = async (req, res) => {
  try {
    const { userId } = req.user;
    const { title, description, start_date, end_date, priority, status, user_id } = req.body;

    // Validate required fields
    if (!title || !start_date) {
      return res.status(400).json({
        message: 'Title and start date are required'
      });
    }

    const query = `
      INSERT INTO tasks (title, description, due_date, priority, status, assigned_to, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `;

    const values = [
      title,
      description || null,
      start_date,
      priority || 'medium',
      status || 'pending',
      user_id || userId,
      userId
    ];

    pool.query(query, values, (error, results) => {
      if (error) {
        return res.status(500).json({
          message: 'Error creating event',
          error: error.message
        });
      }

      const newEvent = results.rows[0];

      res.status(201).json({
        message: 'Event created successfully',
        event: newEvent
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
 * Update a calendar event
 * @route   PATCH /calendar/:id
 * @desc    Update a calendar event
 * @access  Private
 */
const updateEvent = async (req, res) => {
  try {
    const { userId, roleId: role } = req.user;
    const { id: eventId } = req.params;
    const { title, description, start_date, end_date, priority, status, user_id } = req.body;

    // First check if the event exists
    const checkQuery = 'SELECT * FROM tasks WHERE id = $1';
    pool.query(checkQuery, [eventId], (checkError, checkResults) => {
      if (checkError) {
        return res.status(500).json({
          message: 'Error checking event',
          error: checkError.message
        });
      }

      if (checkResults.rows.length === 0) {
        return res.status(404).json({
          message: 'Event not found'
        });
      }

      const event = checkResults.rows[0];

      // Check if user has permission to update the event
      if (role === 3 && event.assigned_to !== userId) {
        return res.status(403).json({
          message: 'You can only update your own events'
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
      if (start_date !== undefined) {
        updates.push(`due_date = $${paramCount++}`);
        values.push(start_date);
      }
      if (priority !== undefined) {
        updates.push(`priority = $${paramCount++}`);
        values.push(priority);
      }
      if (status !== undefined) {
        updates.push(`status = $${paramCount++}`);
        values.push(status);
      }
      if (user_id !== undefined) {
        updates.push(`assigned_to = $${paramCount++}`);
        values.push(user_id);
      }

      if (updates.length === 0) {
        return res.status(400).json({
          message: 'No fields to update'
        });
      }

      values.push(eventId);
      const updateQuery = `
        UPDATE tasks
        SET ${updates.join(', ')}, updated_at = NOW()
        WHERE id = $${paramCount}
        RETURNING *
      `;

      pool.query(updateQuery, values, (updateError, updateResults) => {
        if (updateError) {
          return res.status(500).json({
            message: 'Error updating event',
            error: updateError.message
          });
        }

        const updatedEvent = updateResults.rows[0];

        res.status(200).json({
          message: 'Event updated successfully',
          event: updatedEvent
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
 * Delete a calendar event
 * @route   DELETE /calendar/:id
 * @desc    Delete a calendar event
 * @access  Private
 */
const deleteEvent = async (req, res) => {
  try {
    const { userId, roleId: role } = req.user;
    const { id: eventId } = req.params;

    // Only Admin and Manager can delete events
    if (role !== 1 && role !== 2) {
      return res.status(403).json({
        message: 'Only Admin and Manager can delete events'
      });
    }

    // First check if the event exists
    const checkQuery = 'SELECT * FROM tasks WHERE id = $1';
    pool.query(checkQuery, [eventId], (checkError, checkResults) => {
      if (checkError) {
        return res.status(500).json({
          message: 'Error checking event',
          error: checkError.message
        });
      }

      if (checkResults.rows.length === 0) {
        return res.status(404).json({
          message: 'Event not found'
        });
      }

      // Delete the event
      const deleteQuery = 'DELETE FROM tasks WHERE id = $1';
      pool.query(deleteQuery, [eventId], (deleteError, deleteResults) => {
        if (deleteError) {
          return res.status(500).json({
            message: 'Error deleting event',
            error: deleteError.message
          });
        }

        res.status(200).json({
          message: 'Event deleted successfully'
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
  getEvents,
  createEvent,
  updateEvent,
  deleteEvent
};
