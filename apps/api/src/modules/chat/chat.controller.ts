import { createConversationSchema, presenceSchema, sendChatMessageSchema } from '@crm/validation';
import { z } from 'zod';
import { idParams } from '../../platform/http/query.js';
import { controller, created, ok } from '../../platform/http/route.js';
import { actorFrom } from '../../platform/tenancy.js';
import * as service from './chat.service.js';

export const participantSchema = z.object({
  user_id: z.number(),
  is_online: z.boolean(),
  full_name: z.string().nullable(),
  username: z.string().nullable(),
});

export const conversationSchema = z.object({
  id: z.number(),
  name: z.string(),
  is_group: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
  last_read_at: z.string().nullable(),
  last_message: z.string().nullable(),
  last_message_time: z.string().nullable(),
  last_message_sender_id: z.number().nullable(),
  last_message_sender_name: z.string().nullable(),
  unread_count: z.number(),
  participants: z.array(participantSchema),
});

export const chatMessageSchema = z.object({
  id: z.number(),
  conversation_id: z.number(),
  sender_id: z.number(),
  content: z.string(),
  message_type: z.string(),
  attachment_url: z.string().nullable(),
  file_type: z.string().nullable(),
  file_id: z.string().nullable().optional(),
  is_read: z.boolean(),
  created_at: z.string(),
  sender_name: z.string().nullable(),
  sender_username: z.string().nullable(),
});

export const listConversations = controller({
  handle: async ({ auth }) => ok(await service.listConversations(actorFrom(auth))),
});

export const createConversation = controller({
  body: createConversationSchema,
  handle: async ({ auth, body }) =>
    created(await service.createConversation(actorFrom(auth), body)),
});

export const listMessages = controller({
  params: idParams,
  handle: async ({ auth, params }) => ok(await service.listMessages(actorFrom(auth), params.id)),
});

export const sendMessage = controller({
  params: idParams,
  body: sendChatMessageSchema,
  handle: async ({ auth, params, body }) =>
    created(await service.sendMessage(actorFrom(auth), params.id, body)),
});

export const markRead = controller({
  params: idParams,
  handle: async ({ auth, params }) => {
    await service.markRead(actorFrom(auth), params.id);
    return ok({ read: true });
  },
});

export const participants = controller({
  params: idParams,
  handle: async ({ auth, params }) =>
    ok(await service.listParticipants(actorFrom(auth), params.id)),
});

export const presence = controller({
  body: presenceSchema,
  handle: async ({ auth, body }) =>
    ok({ conversation_ids: await service.setPresence(actorFrom(auth), body.is_online) }),
});
