
import express from 'express';
const router = express.Router();
import { getTasks, createTask, updateTask, deleteTask } from '../controllers/task.controller.js';
import authenticateToken from '../middleware/auth.middleware.js';

/**
 * @route   GET /tasks
 * @desc    Get tasks based on user role
 * @access  Private
 */
router.get('/', authenticateToken, getTasks);

/**
 * @route   POST /tasks
 * @desc    Create a new task
 * @access  Private (Admin and Manager only)
 */
router.post('/', authenticateToken, createTask);

/**
 * @route   PATCH /tasks/:id
 * @desc    Update a task
 * @access  Private (Admin, Manager, and assigned user)
 */
router.patch('/:id', authenticateToken, updateTask);

/**
 * @route   DELETE /tasks/:id
 * @desc    Delete a task
 * @access  Private (Admin and Manager only)
 */
router.delete('/:id', authenticateToken, deleteTask);

export default router;
