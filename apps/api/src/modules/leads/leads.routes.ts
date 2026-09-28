import type { ApiModule } from '../../platform/http/route.js';
import { followupSchema } from '../followups/followups.schemas.js';
import * as leads from './leads.controller.js';
import { leadSchema } from './leads.schemas.js';

const tags = ['Leads'];

export const leadsModule: ApiModule = {
  name: 'leads',
  routes: [
    {
      method: 'get',
      path: '/leads',
      summary: 'List leads (own scope: my leads)',
      tags,
      permission: 'crm.leads.read',
      controller: leads.list,
      response: leadSchema.array(),
      paginated: true,
    },
    {
      method: 'post',
      path: '/leads',
      summary: 'Create a lead',
      tags,
      permission: 'crm.leads.create',
      controller: leads.create,
      response: leadSchema,
      successStatus: 201,
    },
    {
      method: 'get',
      path: '/leads/:id',
      summary: 'Get a lead',
      tags,
      permission: 'crm.leads.read',
      controller: leads.get,
      response: leadSchema,
    },
    {
      method: 'patch',
      path: '/leads/:id',
      summary: 'Update a lead (status Converted creates the customer)',
      tags,
      permission: 'crm.leads.update',
      controller: leads.update,
      response: leadSchema,
    },
    {
      method: 'put',
      path: '/leads/:id/assignment',
      summary: 'Assign a lead to a member',
      tags,
      permission: 'crm.leads.assign',
      scope: 'organization',
      controller: leads.assign,
      response: leadSchema,
    },
    {
      method: 'post',
      path: '/leads/:id/followups',
      summary: 'Schedule a follow-up (lead assignee only)',
      tags,
      permission: 'crm.followups.create',
      controller: leads.createFollowup,
      response: followupSchema,
      successStatus: 201,
    },
  ],
};
