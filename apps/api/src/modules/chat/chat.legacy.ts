import { createConversationSchema, presenceSchema, sendChatMessageSchema } from '@crm/validation';
import { Router } from 'express';
import { AppError } from '../../platform/http/errors.js';
import { legacyId, legacyRoute } from '../../platform/http/legacy.js';
import * as service from './chat.service.js';

/** DEPRECATED `/api/chat/*` adapters (camelCase bodies) → chat.service. */
export function legacyChatRouter(): Router {
  const router = Router();
  const permission = 'crm.chat.use' as const;
  const conversationId = (value: unknown) => legacyId(value, 'Conversation not found');

  router.get(
    '/conversations',
    ...legacyRoute({
      permission,
      handle: async ({ actor, res }) => {
        res.status(200).json({
          message: 'Conversations retrieved successfully',
          conversations: await service.listConversations(actor),
        });
      },
    }),
  );

  router.post(
    '/conversations',
    ...legacyRoute({
      permission,
      body: createConversationSchema,
      mapBody: ({ isGroup, participantIds, ...rest }) => ({
        ...rest,
        is_group: Boolean(isGroup),
        participant_ids: participantIds,
      }),
      handle: async ({ actor, body, res }) => {
        try {
          const conversation = await service.createConversation(actor, body);
          res.status(201).json({
            message: 'Conversation created successfully',
            conversationId: conversation.id,
          });
        } catch (error) {
          const existing = (error as { existing?: unknown }).existing;
          if (error instanceof AppError && existing) {
            // Historical contract: 400 with the existing conversation.
            res.status(400).json({ message: error.message, existingConversation: existing });
            return;
          }
          throw error;
        }
      },
    }),
  );

  router.get(
    '/conversations/:conversationId/messages',
    ...legacyRoute({
      permission,
      handle: async ({ actor, req, res }) => {
        const messages = await service.listMessages(
          actor,
          conversationId(req.params.conversationId),
        );
        res.status(200).json({ message: 'Messages retrieved successfully', messages });
      },
    }),
  );

  router.post(
    '/conversations/:conversationId/messages',
    ...legacyRoute({
      permission,
      body: sendChatMessageSchema,
      mapBody: ({ messageType, attachmentUrl, fileType, ...rest }) => ({
        ...rest,
        ...(messageType ? { message_type: messageType } : {}),
        attachment_url: attachmentUrl ?? null,
        file_type: fileType ?? null,
      }),
      handle: async ({ actor, body, req, res }) => {
        const message = await service.sendMessage(
          actor,
          conversationId(req.params.conversationId),
          body,
        );
        res.status(201).json({ message: 'Message sent successfully', data: message });
      },
    }),
  );

  router.put(
    '/conversations/:conversationId/read',
    ...legacyRoute({
      permission,
      handle: async ({ actor, req, res }) => {
        await service.markRead(actor, conversationId(req.params.conversationId));
        res.status(200).json({ message: 'Messages marked as read successfully' });
      },
    }),
  );

  router.put(
    '/online-status',
    ...legacyRoute({
      permission,
      body: presenceSchema,
      mapBody: ({ isOnline }) => ({ is_online: isOnline }),
      handle: async ({ actor, body, res }) => {
        const conversations = await service.setPresence(actor, body.is_online);
        res.status(200).json({ message: 'Online status updated successfully', conversations });
      },
    }),
  );

  router.get(
    '/conversations/:conversationId/participants',
    ...legacyRoute({
      permission,
      handle: async ({ actor, req, res }) => {
        const participants = await service.listParticipants(
          actor,
          conversationId(req.params.conversationId),
        );
        res.status(200).json({ message: 'Participants retrieved successfully', participants });
      },
    }),
  );

  return router;
}
