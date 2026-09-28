import express from 'express';
const router = express.Router();
import { getNotes, getNoteById, createNote, updateNote, deleteNote } from '../controllers/notes.controller.js';
import authenticateToken, { requirePermission } from '../middleware/auth.middleware.js';

router.use(authenticateToken);

/** @route GET /notes */
router.get('/', requirePermission('crm.notes.read'), getNotes);

/** @route GET /notes/:id */
router.get('/:id', requirePermission('crm.notes.read'), getNoteById);

/** @route POST /notes */
router.post('/', requirePermission('crm.notes.create'), createNote);

/** @route PUT /notes/:id */
router.put('/:id', requirePermission('crm.notes.update'), updateNote);

/** @route DELETE /notes/:id */
router.delete('/:id', requirePermission('crm.notes.delete'), deleteNote);

export default router;
