import express from 'express';
const router = express.Router();
import { handleAnswer, handleRecording, handleCallStatus } from '../controllers/plivo.controller.js';
import { verifyPlivoSignature } from '../platform/plivo-signature.js';

// Plivo posts application/x-www-form-urlencoded bodies; every webhook must carry
// a valid X-Plivo-Signature-V3 for the configured public URL (PLIVO_WEBHOOK_URL).
router.use(express.urlencoded({ extended: false, limit: '100kb' }));
router.use(verifyPlivoSignature);

/** @route POST /api/plivo/webhook/answer */
router.post('/webhook/answer', handleAnswer);

/** @route POST /api/plivo/webhook/recording */
router.post('/webhook/recording', handleRecording);

/** @route POST /api/plivo/webhook/status */
router.post('/webhook/status', handleCallStatus);

export default router;
