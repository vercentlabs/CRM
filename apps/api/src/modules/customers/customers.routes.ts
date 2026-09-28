import { z } from 'zod';
import type { ApiModule } from '../../platform/http/route.js';
import * as customers from './customers.controller.js';
import { customerSchema } from './customers.controller.js';

const tags = ['Customers'];

export const customersModule: ApiModule = {
  name: 'customers',
  routes: [
    {
      method: 'get',
      path: '/customers',
      summary: 'List customers (own scope: assigned to me)',
      tags,
      permission: 'crm.customers.read',
      controller: customers.list,
      response: customerSchema.array(),
      paginated: true,
    },
    {
      method: 'post',
      path: '/customers',
      summary: 'Create a customer (email unique per organization)',
      tags,
      permission: 'crm.customers.create',
      controller: customers.create,
      response: customerSchema,
      successStatus: 201,
    },
    {
      method: 'get',
      path: '/customers/:id',
      summary: 'Get a customer',
      tags,
      permission: 'crm.customers.read',
      controller: customers.get,
      response: customerSchema,
    },
    {
      method: 'patch',
      path: '/customers/:id',
      summary: 'Update a customer',
      tags,
      permission: 'crm.customers.update',
      controller: customers.update,
      response: customerSchema,
    },
    {
      method: 'delete',
      path: '/customers/:id',
      summary: 'Delete a customer (permanent)',
      tags,
      permission: 'crm.customers.delete',
      controller: customers.remove,
      response: z.object({ deleted: z.literal(true) }),
    },
  ],
};
