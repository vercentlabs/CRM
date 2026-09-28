import express from 'express';
const router = express.Router();
import { getEvents, createEvent, updateEvent, deleteEvent } from '../controllers/calendar.controller.js';
import authenticateToken, { requirePermission } from '../middleware/auth.middleware.js';

// Calendar events are rows in `tasks`; both surfaces share the crm.tasks.* permissions.
router.use(authenticateToken);

/** @route GET /calendar */
router.get('/', requirePermission('crm.tasks.read'), getEvents);

/** @route POST /calendar */
router.post('/', requirePermission('crm.tasks.create'), createEvent);

/** @route PATCH /calendar/:id */
router.patch('/:id', requirePermission('crm.tasks.update'), updateEvent);

/** @route DELETE /calendar/:id */
router.delete('/:id', requirePermission('crm.tasks.delete'), deleteEvent);

export default router;
