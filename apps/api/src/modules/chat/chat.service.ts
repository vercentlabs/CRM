import { withTransaction } from '@crm/database';
import type { ChatMessage } from '@crm/types';
import type { createConversationSchema, sendChatMessageSchema } from '@crm/validation';
import type { z } from 'zod';
import { pool } from '../../platform/db.js';
import { AppError } from '../../platform/http/errors.js';
import { filterActiveMembers, type Actor } from '../../platform/tenancy.js';
import { attachToChatMessage, signAttachment } from '../files/files.service.js';
import * as chat from './chat.repository.js';

/**
 * Chat rules: every conversation belongs to one organization and is visible
 * only to its participants (organization-wide permissions do NOT bypass
 * participation). Unknown, foreign-tenant or non-participant conversations
 * all answer 404.
 */

async function requireConversation(actor: Actor, conversationId: number): Promise<number> {
  const id = await chat.accessibleConversation(pool, actor, conversationId, actor.userId);
  if (!id) throw AppError.notFound('Conversation not found');
  return id;
}

export const listConversations = (actor: Actor) => chat.listForUser(pool, actor, actor.userId);

export async function listMessages(actor: Actor, conversationId: number): Promise<ChatMessage[]> {
  const id = await requireConversation(actor, conversationId);
  const rows = await chat.listMessages(pool, actor, id);
  await chat.touchLastRead(pool, id, actor.userId);
  return rows.map(signAttachment);
}

export async function createConversation(
  actor: Actor,
  input: z.output<typeof createConversationSchema>,
) {
  const requested = [...new Set(input.participant_ids)];
  const members = await filterActiveMembers(pool, actor, requested);
  if (members.length !== requested.length) {
    // Same answer for unknown users and users of other organizations.
    throw AppError.validation([
      {
        field: 'participant_ids',
        message: 'One or more participants are not members of this organization',
      },
    ]);
  }
  const participants = [...new Set([actor.userId, ...members])];

  if (!input.is_group && participants.length === 2) {
    const existing = await chat.findDirect(pool, actor, [participants[0]!, participants[1]!]);
    if (existing) {
      const error = AppError.conflict('A conversation already exists with this user');
      (error as AppError & { existing?: unknown }).existing = existing;
      throw error;
    }
  }

  const name =
    input.name || (!input.is_group ? await chat.displayName(pool, members[0]!) : null) || 'Unknown';
  const id = await withTransaction(pool, (client) =>
    chat.insertConversation(
      client,
      actor,
      { name, isGroup: input.is_group, createdBy: actor.userId },
      participants,
    ),
  );
  return { id, name, is_group: input.is_group, participant_ids: participants };
}

export async function sendMessage(
  actor: Actor,
  conversationId: number,
  input: z.output<typeof sendChatMessageSchema>,
) {
  const id = await requireConversation(actor, conversationId);
  const messageId = await withTransaction(pool, async (tx) => {
    if (input.file_id) {
      const { file, attach } = await attachToChatMessage(tx, actor, input.file_id);
      const created = await chat.insertMessage(tx, {
        conversationId: id,
        senderId: actor.userId,
        content: input.content,
        messageType: file.mime_type.startsWith('image/') ? 'image' : 'file',
        attachmentUrl: file.url,
        fileType: file.mime_type,
      });
      await attach(created);
      return created;
    }
    return chat.insertMessage(tx, {
      conversationId: id,
      senderId: actor.userId,
      content: input.content,
      messageType: input.message_type,
      attachmentUrl: input.attachment_url ?? null,
      fileType: input.file_type ?? null,
    });
  });
  await chat.touchLastRead(pool, id, actor.userId);
  return signAttachment((await chat.findMessage(pool, actor, messageId))!);
}

export async function markRead(actor: Actor, conversationId: number): Promise<void> {
  const id = await requireConversation(actor, conversationId);
  await chat.touchLastRead(pool, id, actor.userId);
  await chat.markRead(pool, id, actor.userId);
}

/**
 * NOTE: the stored flag is the inverse of the request. This pre-Phase-3
 * behaviour is preserved because current clients compensate for it; fix it
 * together with the clients in Phase 4/5.
 */
export const setPresence = (actor: Actor, isOnline: boolean) =>
  chat.setPresence(pool, actor, actor.userId, !isOnline);

export async function listParticipants(actor: Actor, conversationId: number) {
  const id = await requireConversation(actor, conversationId);
  return chat.participants(pool, actor, id);
}
