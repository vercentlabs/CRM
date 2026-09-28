import express from 'express';
import { login, logout } from '../controllers/auth.controller.js';
import { loginRateLimiter } from '../platform/auth/routes.js';

const router = express.Router();

// POST /login route (rate limited per IP + email)
router.post('/login', loginRateLimiter, login);

// POST /logout route (revokes the session; accepts an access token or a refresh token)
router.post('/logout', logout);

export default router;
