import express from 'express';
const router = express.Router();
import { handleAnswer, handleRecording, handleCallStatus } from '../controllers/plivo.controller.js';

/**
 * @route   POST /api/plivo/webhook/answer
 * @desc    Handle Plivo answer webhook
 * @access  Public (but signature validated)
 */
router.post('/webhook/answer', handleAnswer);

/**
 * @route   POST /api/plivo/webhook/recording
 * @desc    Handle Plivo recording webhook
 * @access  Public (but signature validated)
 */
router.post('/webhook/recording', handleRecording);

/**
 * @route   POST /api/plivo/webhook/status
 * @desc    Handle Plivo call status webhook
 * @access  Public (but signature validated)
 */
router.post('/webhook/status', handleCallStatus);

export default router;
