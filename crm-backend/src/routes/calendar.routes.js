
import express from 'express';
const router = express.Router();
import { getEvents, createEvent, updateEvent, deleteEvent } from '../controllers/calendar.controller.js';
import authenticateToken from '../middleware/auth.middleware.js';

/**
 * @route   GET /calendar
 * @desc    Get calendar events based on user role
 * @access  Private
 */
router.get('/', authenticateToken, getEvents);

/**
 * @route   POST /calendar
 * @desc    Create a new calendar event
 * @access  Private
 */
router.post('/', authenticateToken, createEvent);

/**
 * @route   PATCH /calendar/:id
 * @desc    Update a calendar event
 * @access  Private
 */
router.patch('/:id', authenticateToken, updateEvent);

/**
 * @route   DELETE /calendar/:id
 * @desc    Delete a calendar event
 * @access  Private
 */
router.delete('/:id', authenticateToken, deleteEvent);

export default router;
