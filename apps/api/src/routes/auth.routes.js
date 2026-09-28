import express from 'express';
import { login, logout } from '../controllers/auth.controller.js';
import authenticateToken from '../middleware/auth.middleware.js';

const router = express.Router();

// POST /login route
router.post('/login', login);

// POST /logout route
router.post('/logout', authenticateToken, logout);

export default router;
