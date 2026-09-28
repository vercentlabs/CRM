import { createCustomerSchema, updateCustomerSchema } from '@crm/validation';
import { z } from 'zod';
import { controller, created, ok, paginationMeta } from '../../platform/http/route.js';
import { idParams, offsetOf, pageQuery, sortQuery } from '../../platform/http/query.js';
import { actorFrom } from '../../platform/tenancy.js';
import { CUSTOMER_SORTS } from './customers.repository.js';
import * as service from './customers.service.js';

export const customerSchema = z.object({
  id: z.number(),
  name: z.string(),
  email: z.string(),
  phone: z.string().nullable(),
  address: z.string().nullable(),
  assigned_to: z.number().nullable(),
  created_by: z.number(),
  created_at: z.string(),
  updated_at: z.string(),
});

const listQuery = z.object({ ...pageQuery, sort: sortQuery(CUSTOMER_SORTS, '-created_at') });

export const list = controller({
  query: listQuery,
  handle: async ({ auth, query }) => {
    const { items, total } = await service.listCustomers(actorFrom(auth), query.sort, {
      limit: query.limit,
      offset: offsetOf(query),
    });
    return ok(items, paginationMeta(query.page, query.limit, total));
  },
});

export const get = controller({
  params: idParams,
  handle: async ({ auth, params }) => ok(await service.getCustomer(actorFrom(auth), params.id)),
});

export const create = controller({
  body: createCustomerSchema,
  handle: async ({ auth, body }) => created(await service.createCustomer(actorFrom(auth), body)),
});

export const update = controller({
  params: idParams,
  body: updateCustomerSchema,
  handle: async ({ auth, params, body }) =>
    ok(await service.updateCustomer(actorFrom(auth), params.id, body)),
});

export const remove = controller({
  params: idParams,
  handle: async ({ auth, params }) => {
    await service.deleteCustomer(actorFrom(auth), params.id);
    return ok({ deleted: true });
  },
});
