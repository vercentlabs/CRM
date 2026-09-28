import type { ApiModule } from '../../platform/http/route.js';
import * as opportunities from './opportunities.controller.js';
import { opportunitySchema } from './opportunities.controller.js';

const tags = ['Opportunities'];

export const opportunitiesModule: ApiModule = {
  name: 'opportunities',
  routes: [
    {
      method: 'get',
      path: '/opportunities',
      summary: 'List opportunities',
      tags,
      permission: 'crm.opportunities.read',
      controller: opportunities.list,
      response: opportunitySchema.array(),
      paginated: true,
    },
    {
      method: 'post',
      path: '/opportunities',
      summary: 'Create an opportunity on a visible lead',
      tags,
      permission: 'crm.opportunities.create',
      controller: opportunities.create,
      response: opportunitySchema,
      successStatus: 201,
    },
    {
      method: 'get',
      path: '/opportunities/:id',
      summary: 'Get an opportunity',
      tags,
      permission: 'crm.opportunities.read',
      controller: opportunities.get,
      response: opportunitySchema,
    },
    {
      method: 'patch',
      path: '/opportunities/:id',
      summary: 'Update an opportunity (stage, value, probability, dates)',
      tags,
      permission: 'crm.opportunities.update',
      controller: opportunities.update,
      response: opportunitySchema,
    },
    {
      method: 'put',
      path: '/opportunities/:id/assignment',
      summary: 'Assign an opportunity to a member',
      tags,
      permission: 'crm.opportunities.assign',
      scope: 'organization',
      controller: opportunities.assign,
      response: opportunitySchema,
    },
  ],
};
