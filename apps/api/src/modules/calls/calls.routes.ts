import type { ApiModule } from '../../platform/http/route.js';
import * as calls from './calls.controller.js';
import { callSchema } from './calls.controller.js';

const tags = ['Calls'];

export const callsModule: ApiModule = {
  name: 'calls',
  routes: [
    {
      method: 'get',
      path: '/calls',
      summary: 'List call logs (own scope: calls I placed)',
      tags,
      permission: 'crm.calls.read',
      controller: calls.list,
      response: callSchema.array(),
      paginated: true,
    },
    {
      method: 'post',
      path: '/calls',
      summary: 'Place a call to a lead (telephony provider)',
      tags,
      permission: 'crm.calls.create',
      controller: calls.initiate,
      response: callSchema,
      successStatus: 201,
    },
    {
      method: 'post',
      path: '/calls/:id/end',
      summary: 'End a call (own scope: calls I placed)',
      tags,
      permission: 'crm.calls.update',
      controller: calls.end,
      response: callSchema,
    },
  ],
};
