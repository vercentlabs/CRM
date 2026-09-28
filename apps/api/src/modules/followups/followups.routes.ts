import type { ApiModule } from '../../platform/http/route.js';
import * as followups from './followups.controller.js';
import { followupSchema, scheduleItemSchema } from './followups.schemas.js';

const tags = ['Follow-ups'];

export const followupsModule: ApiModule = {
  name: 'followups',
  routes: [
    {
      method: 'get',
      path: '/followups',
      summary: 'Follow-up schedule (leads with next_call_at); ?overdue=true for overdue only',
      tags,
      permission: 'crm.followups.read',
      controller: followups.schedule,
      response: scheduleItemSchema.array(),
    },
    {
      method: 'post',
      path: '/followups/:id/complete',
      summary: 'Complete a follow-up (own scope: assigned to me)',
      tags,
      permission: 'crm.followups.update',
      controller: followups.complete,
      response: followupSchema,
    },
  ],
};
