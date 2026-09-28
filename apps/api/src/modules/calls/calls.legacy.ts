import { endCallSchema, initiateCallSchema } from '@crm/validation';
import { Router } from 'express';
import { legacyId, legacyRoute } from '../../platform/http/legacy.js';
import * as service from './calls.service.js';

/** DEPRECATED `/calls/*` adapters → calls.service. Body used `leadId`. */
export function legacyCallsRouter(): Router {
  const router = Router();

  router.post(
    '/initiate',
    ...legacyRoute({
      permission: 'crm.calls.create',
      body: initiateCallSchema,
      mapBody: ({ leadId, ...rest }) => ({ ...rest, lead_id: leadId }),
      handle: async ({ actor, body, res }) => {
        const { call, providerCallId } = await service.initiateCall(actor, body.lead_id);
        res.status(201).json({
          message: 'Call initiated successfully',
          callId: call.id,
          plivoCallUuid: providerCallId,
        });
      },
    }),
  );

  router.put(
    '/:id/end',
    ...legacyRoute({
      permission: 'crm.calls.update',
      body: endCallSchema,
      handle: async ({ actor, body, req, res }) => {
        const callId = legacyId(req.params.id, 'Call not found');
        const { updatedFields } = await service.endCall(actor, callId, body);
        res.status(200).json({ message: 'Call ended successfully', callId, updatedFields });
      },
    }),
  );

  router.get(
    '/',
    ...legacyRoute({
      permission: 'crm.calls.read',
      handle: async ({ actor, res }) => {
        const { items } = await service.listCalls(actor, 'all');
        res.status(200).json({ message: 'Call logs retrieved successfully', calls: items });
      },
    }),
  );

  return router;
}
