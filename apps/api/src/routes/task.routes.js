import express from 'express';
const router = express.Router();
import { getTasks, createTask, updateTask, deleteTask } from '../controllers/task.controller.js';
import authenticateToken, { requirePermission } from '../middleware/auth.middleware.js';

// Calendar events are rows in `tasks`; both surfaces share the crm.tasks.* permissions.
router.use(authenticateToken);

/** @route GET /tasks */
router.get('/', requirePermission('crm.tasks.read'), getTasks);

/** @route POST /tasks */
router.post('/', requirePermission('crm.tasks.create'), createTask);

/** @route PATCH /tasks/:id */
router.patch('/:id', requirePermission('crm.tasks.update'), updateTask);

/** @route DELETE /tasks/:id */
router.delete('/:id', requirePermission('crm.tasks.delete'), deleteTask);

export default router;
