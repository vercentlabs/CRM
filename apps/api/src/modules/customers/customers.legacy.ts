import { createCustomerSchema } from '@crm/validation';
import { Router } from 'express';
import { legacyId, legacyRoute } from '../../platform/http/legacy.js';
import { sendSuccess } from '../../platform/http/legacy-response.js';
import * as service from './customers.service.js';

/**
 * DEPRECATED `/customers/*` adapters → customers.service. The legacy body uses
 * `assignedTo` and PUT is a full replacement (missing phone/address/assignee → null).
 */
const toSnake = (body: Record<string, unknown>) => {
  const { assignedTo, ...rest } = body;
  return {
    ...rest,
    assigned_to: assignedTo ?? null,
    phone: rest.phone || null,
    address: rest.address || null,
  };
};

export function legacyCustomersRouter(): Router {
  const router = Router();

  router.get(
    '/',
    ...legacyRoute({
      permission: 'crm.customers.read',
      handle: async ({ actor, res }) => {
        const { items } = await service.listCustomers(actor, 'c.created_at DESC', 'all');
        sendSuccess(res, 'Customers retrieved successfully', { customers: items });
      },
    }),
  );

  router.post(
    '/',
    ...legacyRoute({
      permission: 'crm.customers.create',
      body: createCustomerSchema,
      mapBody: toSnake,
      handle: async ({ actor, body, res }) => {
        const customer = await service.createCustomer(actor, body);
        sendSuccess(res, 'Customer created successfully', { customer });
      },
    }),
  );

  router.put(
    '/:id',
    ...legacyRoute({
      permission: 'crm.customers.update',
      body: createCustomerSchema,
      mapBody: toSnake,
      handle: async ({ actor, body, req, res }) => {
        const customer = await service.updateCustomer(
          actor,
          legacyId(req.params.id, 'Customer not found'),
          {
            ...body,
            assigned_to: body.assigned_to ?? null,
          },
        );
        sendSuccess(res, 'Customer updated successfully', { customer });
      },
    }),
  );

  router.delete(
    '/:id',
    ...legacyRoute({
      permission: 'crm.customers.delete',
      handle: async ({ actor, req, res }) => {
        await service.deleteCustomer(actor, legacyId(req.params.id, 'Customer not found'));
        sendSuccess(res, 'Customer deleted successfully');
      },
    }),
  );

  return router;
}
