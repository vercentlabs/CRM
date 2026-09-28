import { z } from 'zod';
import type { ApiModule } from '../../platform/http/route.js';
import * as chat from './chat.controller.js';
import { chatMessageSchema, conversationSchema, participantSchema } from './chat.controller.js';

const tags = ['Chat'];
const permission = 'crm.chat.use' as const;

export const chatModule: ApiModule = {
  name: 'chat',
  routes: [
    {
      method: 'get',
      path: '/chat/conversations',
      summary: 'My conversations in the active organization',
      tags,
      permission,
      controller: chat.listConversations,
      response: conversationSchema.array(),
    },
    {
      method: 'post',
      path: '/chat/conversations',
      summary: 'Start a conversation with members of the organization',
      tags,
      permission,
      controller: chat.createConversation,
      successStatus: 201,
      response: z.object({
        id: z.number(),
        name: z.string(),
        is_group: z.boolean(),
        participant_ids: z.array(z.number()),
      }),
    },
    {
      method: 'get',
      path: '/chat/conversations/:id/messages',
      summary: 'Messages of a conversation (participants only)',
      tags,
      permission,
      controller: chat.listMessages,
      response: chatMessageSchema.array(),
    },
    {
      method: 'post',
      path: '/chat/conversations/:id/messages',
      summary: 'Send a chat message (participants only)',
      tags,
      permission,
      controller: chat.sendMessage,
      response: chatMessageSchema,
      successStatus: 201,
    },
    {
      method: 'post',
      path: '/chat/conversations/:id/read',
      summary: 'Mark a conversation read',
      tags,
      permission,
      controller: chat.markRead,
      response: z.object({ read: z.literal(true) }),
    },
    {
      method: 'get',
      path: '/chat/conversations/:id/participants',
      summary: 'Participants of a conversation',
      tags,
      permission,
      controller: chat.participants,
      response: participantSchema.array(),
    },
    {
      method: 'put',
      path: '/chat/presence',
      summary: 'Set my online status',
      tags,
      permission,
      controller: chat.presence,
      response: z.object({ conversation_ids: z.array(z.number()) }),
    },
  ],
};
