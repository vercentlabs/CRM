
import express from 'express';
const router = express.Router();
import { getNotes, getNoteById, createNote, updateNote, deleteNote } from '../controllers/notes.controller.js';
import authenticateToken from '../middleware/auth.middleware.js';

/**
 * @route   GET /notes
 * @desc    Get notes based on user role
 * @access  Private
 */
router.get('/', authenticateToken, getNotes);

/**
 * @route   GET /notes/:id
 * @desc    Get a single note by ID
 * @access  Private
 */
router.get('/:id', authenticateToken, getNoteById);

/**
 * @route   POST /notes
 * @desc    Create a new note
 * @access  Private
 */
router.post('/', authenticateToken, createNote);

/**
 * @route   PUT /notes/:id
 * @desc    Update a note
 * @access  Private
 */
router.put('/:id', authenticateToken, updateNote);

/**
 * @route   DELETE /notes/:id
 * @desc    Delete a note (soft delete)
 * @access  Private
 */
router.delete('/:id', authenticateToken, deleteNote);

export default router;
