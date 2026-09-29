import { z } from 'zod';
import type { ApiModule } from '../../platform/http/route.js';
import * as messages from './messages.controller.js';
import { policies, rateLimit } from '../../platform/rate-limit.js';
import { leadMessageSchema } from './messages.controller.js';

const tags = ['Lead messages'];

export const messagesModule: ApiModule = {
  name: 'messages',
  routes: [
    {
      method: 'get',
      path: '/messages',
      summary: 'List lead messages (own scope: messages I sent)',
      tags,
      permission: 'crm.messages.read',
      controller: messages.list,
      response: leadMessageSchema.array(),
      paginated: true,
    },
    {
      method: 'post',
      path: '/messages',
      summary: 'Send a message to a lead',
      tags,
      permission: 'crm.messages.send',
      before: [rateLimit(policies.sensitive)],
      controller: messages.send,
      response: leadMessageSchema,
      successStatus: 201,
    },
    {
      method: 'post',
      path: '/messages/bulk',
      summary: 'Send one message to many leads (all-or-nothing)',
      tags,
      permission: 'crm.messages.send',
      before: [rateLimit(policies.sensitive)],
      controller: messages.sendBulk,
      response: z.object({ count: z.number(), ids: z.array(z.number()) }),
      successStatus: 201,
    },
    {
      method: 'patch',
      path: '/messages/:id/status',
      summary: 'Update delivery status',
      tags,
      permission: 'crm.messages.update',
      controller: messages.setStatus,
      response: leadMessageSchema,
    },
  ],
};
