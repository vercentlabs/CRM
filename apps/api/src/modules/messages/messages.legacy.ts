import { bulkMessageSchema, messageStatusSchema, sendMessageSchema } from '@crm/validation';
import { Router } from 'express';
import { legacyId, legacyRoute } from '../../platform/http/legacy.js';
import * as service from './messages.service.js';

/**
 * DEPRECATED `/messages/*` and `/api/lead-messages/*` adapters (identical
 * historical contracts; bodies used `leadId` / `leadIds`) → messages.service.
 */
export function legacyMessagesRouter(): Router {
  const router = Router();

  router.post(
    '/send',
    ...legacyRoute({
      permission: 'crm.messages.send',
      body: sendMessageSchema,
      mapBody: ({ leadId, ...rest }) => ({ ...rest, lead_id: leadId }),
      handle: async ({ actor, body, res }) => {
        const message = await service.sendMessage(actor, body);
        res.status(201).json({ message: 'Message sent successfully', messageId: message.id });
      },
    }),
  );

  router.get(
    '/',
    ...legacyRoute({
      permission: 'crm.messages.read',
      handle: async ({ actor, res }) => {
        const { items } = await service.listMessages(actor, undefined, 'all');
        res.status(200).json({ message: 'Messages retrieved successfully', messages: items });
      },
    }),
  );

  router.put(
    '/:id/status',
    ...legacyRoute({
      permission: 'crm.messages.update',
      body: messageStatusSchema,
      handle: async ({ actor, body, req, res }) => {
        const message = await service.updateStatus(
          actor,
          legacyId(req.params.id, 'Message not found'),
          body.status,
        );
        res.status(200).json({
          message: 'Message status updated successfully',
          messageId: message.id,
          status: message.status,
        });
      },
    }),
  );

  router.post(
    '/bulk',
    ...legacyRoute({
      permission: 'crm.messages.send',
      body: bulkMessageSchema,
      mapBody: ({ leadIds, ...rest }) => ({ ...rest, lead_ids: leadIds }),
      handle: async ({ actor, body, res }) => {
        const { count } = await service.sendBulk(actor, body);
        res.status(201).json({ message: 'Bulk messages queued', count });
      },
    }),
  );

  return router;
}
