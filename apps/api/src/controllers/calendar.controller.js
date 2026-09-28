
import pool from '../config/db.js';
import { scopeFor, serverError, tenantOf } from '../platform/tenancy.js';
import { loadScopedTask, resolveTaskAssignee } from './task.controller.js';

/**
 * Calendar events are rows in `tasks` (crm.tasks.* permissions, own scope =
 * assigned to me), always bounded by the verified organization.
 */

/**
 * @route   GET /calendar
 * @access  crm.tasks.read
 */
const getEvents = async (req, res) => {
  try {
    const { organizationId, userId } = tenantOf(req);
    const params = [organizationId];
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
      WHERE t.organization_id = $1
    `;

    if (scopeFor(req, 'crm.tasks.read') !== 'organization') {
      params.push(userId);
      query += ` AND t.assigned_to = $${params.length}`;
    }

    query += ' ORDER BY t.due_date ASC';
    const results = await pool.query(query, params);

    res.status(200).json({
      message: 'Events retrieved successfully',
      events: results.rows
    });
  } catch (error) {
    return serverError(res, 'Error retrieving calendar events', error);
  }
};

/**
 * @route   POST /calendar
 * @access  crm.tasks.create (defaults to assigning the creator)
 */
const createEvent = async (req, res) => {
  try {
    const { organizationId, userId } = tenantOf(req);
    const { title, description, start_date, priority, status, user_id } = req.body;

    if (!title || !start_date) {
      return res.status(400).json({
        message: 'Title and start date are required'
      });
    }

    const assignment = await resolveTaskAssignee(req, 'crm.tasks.create', user_id, { defaultToSelf: true });
    if (assignment.error) return res.status(assignment.status).json({ message: assignment.error });

    try {
      const results = await pool.query(
        `INSERT INTO tasks (organization_id, title, description, due_date, priority, status, assigned_to, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [organizationId, title, description || null, start_date, priority || 'medium', status || 'pending', assignment.assignee, userId]
      );
      res.status(201).json({
        message: 'Event created successfully',
        event: results.rows[0]
      });
    } catch (error) {
      if (error.code === '23514' || error.code === '22007' || error.code === '22008') {
        return res.status(400).json({ message: 'Event data violates a validation rule' });
      }
      throw error;
    }
  } catch (error) {
    return serverError(res, 'Error creating event', error);
  }
};

/**
 * @route   PATCH /calendar/:id
 * @access  crm.tasks.update (own scope: events assigned to me)
 */
const updateEvent = async (req, res) => {
  try {
    const { organizationId } = tenantOf(req);
    const { title, description, start_date, priority, status, user_id } = req.body;

    const loaded = await loadScopedTask(req, 'crm.tasks.update', req.params.id);
    if (loaded.status === 404) return res.status(404).json({ message: 'Event not found' });
    if (loaded.status === 403) return res.status(403).json({ message: 'You can only update your own events' });

    const updates = [];
    const values = [];
    const set = (column, value) => {
      values.push(value);
      updates.push(`${column} = $${values.length}`);
    };

    if (title !== undefined) set('title', title);
    if (description !== undefined) set('description', description);
    if (start_date !== undefined) set('due_date', start_date);
    if (priority !== undefined) set('priority', priority);
    if (status !== undefined) set('status', status);
    if (user_id !== undefined) {
      const assignment = await resolveTaskAssignee(req, 'crm.tasks.update', user_id, { defaultToSelf: false });
      if (assignment.error) return res.status(assignment.status).json({ message: assignment.error });
      set('assigned_to', assignment.assignee);
    }

    if (updates.length === 0) {
      return res.status(400).json({
        message: 'No fields to update'
      });
    }

    values.push(loaded.task.id, organizationId);
    try {
      const updateResults = await pool.query(
        `UPDATE tasks SET ${updates.join(', ')}, updated_at = NOW()
         WHERE id = $${values.length - 1} AND organization_id = $${values.length}
         RETURNING *`,
        values
      );
      res.status(200).json({
        message: 'Event updated successfully',
        event: updateResults.rows[0]
      });
    } catch (error) {
      if (error.code === '23514' || error.code === '22007' || error.code === '22008') {
        return res.status(400).json({ message: 'Event data violates a validation rule' });
      }
      throw error;
    }
  } catch (error) {
    return serverError(res, 'Error updating event', error);
  }
};

/**
 * @route   DELETE /calendar/:id
 * @access  crm.tasks.delete
 */
const deleteEvent = async (req, res) => {
  try {
    const { organizationId } = tenantOf(req);
    const loaded = await loadScopedTask(req, 'crm.tasks.delete', req.params.id);
    if (loaded.status === 404) return res.status(404).json({ message: 'Event not found' });
    if (loaded.status === 403) return res.status(403).json({ message: 'You can only delete your own events' });

    await pool.query('DELETE FROM tasks WHERE id = $1 AND organization_id = $2', [loaded.task.id, organizationId]);

    res.status(200).json({
      message: 'Event deleted successfully'
    });
  } catch (error) {
    return serverError(res, 'Error deleting event', error);
  }
};

export {
  getEvents,
  createEvent,
  updateEvent,
  deleteEvent
};
