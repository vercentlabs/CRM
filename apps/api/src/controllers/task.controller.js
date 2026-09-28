
import pool from '../config/db.js';
import { logAuditEvent } from '../utils/auditLogger.js';
import { isActiveMember, parseId, scopeFor, serverError, tenantOf } from '../platform/tenancy.js';

/**
 * Tasks (and calendar events, which are task rows). Own scope = assigned to me.
 * Exported helpers are shared with calendar.controller.js.
 */
export const resolveTaskAssignee = async (req, permission, requested, { defaultToSelf }) => {
  const { organizationId, userId } = tenantOf(req);
  const assignee = requested === undefined || requested === null || requested === '' ? null : parseId(requested);
  if (requested && assignee === null) return { error: 'Assigned user is not a member of this organization', status: 400 };
  if (scopeFor(req, permission) !== 'organization') {
    if (assignee !== null && assignee !== userId) {
      return { error: 'You can only assign tasks to yourself', status: 403 };
    }
    return { assignee: userId };
  }
  if (assignee !== null && !(await isActiveMember(organizationId, assignee))) {
    return { error: 'Assigned user is not a member of this organization', status: 400 };
  }
  return { assignee: assignee ?? (defaultToSelf ? userId : null) };
};

/** Loads a task inside the organization; `forbidden` when outside the caller's scope. */
export const loadScopedTask = async (req, permission, rawId) => {
  const { organizationId, userId } = tenantOf(req);
  const id = parseId(rawId);
  if (id === null) return { status: 404 };
  const result = await pool.query('SELECT * FROM tasks WHERE id = $1 AND organization_id = $2', [id, organizationId]);
  const task = result.rows[0];
  if (!task) return { status: 404 };
  if (scopeFor(req, permission) !== 'organization' && task.assigned_to !== userId) return { status: 403, task };
  return { status: 200, task };
};

/**
 * @route   GET /tasks
 * @access  crm.tasks.read
 */
const getTasks = async (req, res) => {
  try {
    const { organizationId, userId } = tenantOf(req);
    const params = [organizationId];
    let query = `
      SELECT t.*, u.full_name as assigned_to_name, u.email as assigned_to_email
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
      message: 'Tasks retrieved successfully',
      tasks: results.rows
    });
  } catch (error) {
    return serverError(res, 'Error retrieving tasks', error);
  }
};

/**
 * @route   POST /tasks
 * @access  crm.tasks.create (own scope: the task is assigned to the creator)
 */
const createTask = async (req, res) => {
  try {
    const { organizationId, userId } = tenantOf(req);
    const { title, description, due_date, priority, assigned_to, status } = req.body;

    if (!title || !due_date) {
      return res.status(400).json({
        message: 'Title and due date are required'
      });
    }

    const assignment = await resolveTaskAssignee(req, 'crm.tasks.create', assigned_to, { defaultToSelf: false });
    if (assignment.error) return res.status(assignment.status).json({ message: assignment.error });

    let newTask;
    try {
      const results = await pool.query(
        `INSERT INTO tasks (organization_id, title, description, due_date, priority, assigned_to, status, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [organizationId, title, description || null, due_date, priority || 'medium', assignment.assignee, status || 'pending', userId]
      );
      newTask = results.rows[0];
    } catch (error) {
      if (error.code === '23514' || error.code === '22007' || error.code === '22008') {
        return res.status(400).json({ message: 'Task data violates a validation rule' });
      }
      throw error;
    }

    await logAuditEvent(userId, 'CREATE_TASK', 'tasks', newTask.id, null, {
      title: newTask.title,
      assigned_to: newTask.assigned_to,
      due_date: newTask.due_date
    });

    res.status(201).json({
      message: 'Task created successfully',
      task: newTask
    });
  } catch (error) {
    return serverError(res, 'Error creating task', error);
  }
};

/**
 * @route   PATCH /tasks/:id
 * @access  crm.tasks.update (own scope: tasks assigned to me)
 */
const updateTask = async (req, res) => {
  try {
    const { organizationId, userId } = tenantOf(req);
    const { title, description, due_date, priority, assigned_to, status } = req.body;

    const loaded = await loadScopedTask(req, 'crm.tasks.update', req.params.id);
    if (loaded.status === 404) return res.status(404).json({ message: 'Task not found' });
    if (loaded.status === 403) return res.status(403).json({ message: 'You can only update your own tasks' });

    const updates = [];
    const values = [];
    const set = (column, value) => {
      values.push(value);
      updates.push(`${column} = $${values.length}`);
    };

    if (title !== undefined) set('title', title);
    if (description !== undefined) set('description', description);
    if (due_date !== undefined) set('due_date', due_date);
    if (priority !== undefined) set('priority', priority);
    if (assigned_to !== undefined) {
      const assignment = await resolveTaskAssignee(req, 'crm.tasks.update', assigned_to, { defaultToSelf: false });
      if (assignment.error) return res.status(assignment.status).json({ message: assignment.error });
      set('assigned_to', assignment.assignee);
    }
    if (status !== undefined) set('status', status);

    if (updates.length === 0) {
      return res.status(400).json({
        message: 'No fields to update'
      });
    }

    values.push(loaded.task.id, organizationId);
    let updatedTask;
    try {
      const updateResults = await pool.query(
        `UPDATE tasks SET ${updates.join(', ')}, updated_at = NOW()
         WHERE id = $${values.length - 1} AND organization_id = $${values.length}
         RETURNING *`,
        values
      );
      updatedTask = updateResults.rows[0];
    } catch (error) {
      if (error.code === '23514' || error.code === '22007' || error.code === '22008') {
        return res.status(400).json({ message: 'Task data violates a validation rule' });
      }
      throw error;
    }

    await logAuditEvent(userId, 'UPDATE_TASK', 'tasks', updatedTask.id, null, {
      title: updatedTask.title,
      assigned_to: updatedTask.assigned_to,
      status: updatedTask.status
    });

    res.status(200).json({
      message: 'Task updated successfully',
      task: updatedTask
    });
  } catch (error) {
    return serverError(res, 'Error updating task', error);
  }
};

/**
 * @route   DELETE /tasks/:id
 * @access  crm.tasks.delete
 */
const deleteTask = async (req, res) => {
  try {
    const { organizationId, userId } = tenantOf(req);
    const loaded = await loadScopedTask(req, 'crm.tasks.delete', req.params.id);
    if (loaded.status === 404) return res.status(404).json({ message: 'Task not found' });
    if (loaded.status === 403) return res.status(403).json({ message: 'You can only delete your own tasks' });

    await pool.query('DELETE FROM tasks WHERE id = $1 AND organization_id = $2', [loaded.task.id, organizationId]);

    await logAuditEvent(userId, 'DELETE_TASK', 'tasks', loaded.task.id, {
      title: loaded.task.title,
      assigned_to: loaded.task.assigned_to
    });

    res.status(200).json({
      message: 'Task deleted successfully'
    });
  } catch (error) {
    return serverError(res, 'Error deleting task', error);
  }
};

export {
  getTasks,
  createTask,
  updateTask,
  deleteTask
};
