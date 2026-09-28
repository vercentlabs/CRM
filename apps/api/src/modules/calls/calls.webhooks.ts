import express, { Router } from 'express';
import { verifyPlivoSignature } from '../../platform/plivo-signature.js';
import * as messages from '../messages/messages.service.js';
import * as service from './calls.service.js';
import { errorFields, logger } from '../../platform/logger.js';

/**
 * Plivo webhooks (`/api/plivo/webhook/*`, a stable provider-configured URL, not deprecated): form-encoded, signature-verified,
 * and delegated to calls.service. Provider callbacks always get a response so
 * Plivo does not retry on internal persistence errors (historical behaviour).
 */
export function plivoWebhookRouter(): Router {
  const router = Router();
  router.use(express.urlencoded({ extended: false, limit: '100kb' }));
  router.use(verifyPlivoSignature);

  const field = (body: unknown, key: string) => {
    const value = (body as Record<string, unknown> | undefined)?.[key];
    return typeof value === 'string' ? value : undefined;
  };
  const logFailure = (event: string, error: unknown) =>
    logger.error('plivo_webhook_failed', { event, ...errorFields(error) });

  router.post('/webhook/answer', async (req, res) => {
    let xml = '';
    try {
      xml = await service.onCallAnswered(
        {
          callUuid: field(req.body, 'CallUUID'),
          from: field(req.body, 'From'),
          status: field(req.body, 'CallStatus'),
        },
        `${process.env.PLIVO_WEBHOOK_URL}/recording`,
      );
    } catch (error) {
      logFailure('answer', error);
    }
    res.set('Content-Type', 'text/xml').send(xml);
  });

  router.post('/webhook/recording', async (req, res) => {
    await service
      .onRecordingReady({
        callUuid: field(req.body, 'CallUUID'),
        url: field(req.body, 'RecordingUrl'),
        duration: field(req.body, 'RecordingDuration'),
        recordingId: field(req.body, 'RecordingID'),
      })
      .catch((error) => logFailure('recording', error));
    res.status(200).json({ message: 'Recording received' });
  });

  router.post('/webhook/status', async (req, res) => {
    await service
      .onCallStatus({
        callUuid: field(req.body, 'CallUUID'),
        status: field(req.body, 'CallStatus'),
        duration: field(req.body, 'CallDuration'),
      })
      .catch((error) => logFailure('status', error));
    res.status(200).json({ message: 'Call status received' });
  });

  /** SMS delivery reports: a small idempotent update, then an immediate 200. */
  router.post('/webhook/message-status', async (req, res) => {
    await messages
      .onProviderStatus({
        messageUuid: field(req.body, 'MessageUUID'),
        status: field(req.body, 'Status'),
        errorCode: field(req.body, 'ErrorCode'),
      })
      .catch((error) => logFailure('message-status', error));
    res.status(200).json({ message: 'Message status received' });
  });

  return router;
}
