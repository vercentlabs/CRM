import type { Queryable } from '@crm/database';
import type { ChatMessage, ChatParticipant, Conversation } from '@crm/types';
import type { Tenant } from '../../platform/tenancy.js';

/**
 * Internal team chat. Tenancy is derived from chat_conversations.organization_id;
 * participants/messages are always reached through a conversation of the
 * tenant. `role_id` in results is the member's legacy role id in this
 * organization (display only).
 */

const roleJoin = (userAlias: string, orgExpr: string, alias: string) => `
  LEFT JOIN organization_memberships ${alias}_m ON ${alias}_m.user_id = ${userAlias}.id AND ${alias}_m.organization_id = ${orgExpr}
  LEFT JOIN roles ${alias}_r ON ${alias}_r.id = ${alias}_m.role_id`;

export async function listForUser(
  db: Queryable,
  tenant: Tenant,
  userId: number,
): Promise<Conversation[]> {
  const result = await db.query(
    `SELECT c.id, c.name, c.is_group, c.created_at, c.updated_at, me.last_read_at,
            cm.content AS last_message, cm.created_at AS last_message_time, cm.sender_id AS last_message_sender_id,
            su.full_name AS last_message_sender_name, su.username AS last_message_sender_username,
            s_r.legacy_role_id AS last_message_sender_role_id,
            COALESCE(unread.unread_count, 0)::int AS unread_count,
            COALESCE(
              (SELECT json_agg(jsonb_build_object(
                 'user_id', cp.user_id, 'is_online', cp.is_online, 'full_name', pu.full_name,
                 'username', pu.username, 'role_id', p_r.legacy_role_id))
               FROM chat_participants cp
               JOIN users pu ON pu.id = cp.user_id
               ${roleJoin('pu', 'c.organization_id', 'p')}
               WHERE cp.conversation_id = c.id),
              '[]'::json
            ) AS participants
     FROM chat_conversations c
     JOIN chat_participants me ON me.conversation_id = c.id AND me.user_id = $2
     LEFT JOIN chat_messages cm ON cm.id = (SELECT MAX(id) FROM chat_messages WHERE conversation_id = c.id)
     LEFT JOIN users su ON su.id = cm.sender_id
     ${roleJoin('su', 'c.organization_id', 's')}
     LEFT JOIN (
       SELECT conversation_id, COUNT(*) AS unread_count FROM chat_messages
       WHERE is_read = false AND sender_id != $2 GROUP BY conversation_id
     ) unread ON unread.conversation_id = c.id
     WHERE c.organization_id = $1
     ORDER BY c.updated_at DESC, c.id DESC`,
    [tenant.organizationId, userId],
  );
  return result.rows;
}

/** The conversation id when it belongs to the tenant AND the user participates; else null. */
export async function accessibleConversation(
  db: Queryable,
  tenant: Tenant,
  conversationId: number,
  userId: number,
): Promise<number | null> {
  const result = await db.query(
    `SELECT c.id FROM chat_conversations c
     JOIN chat_participants p ON p.conversation_id = c.id AND p.user_id = $3
     WHERE c.id = $1 AND c.organization_id = $2`,
    [conversationId, tenant.organizationId, userId],
  );
  return result.rows[0]?.id ?? null;
}

export async function listMessages(
  db: Queryable,
  tenant: Tenant,
  conversationId: number,
): Promise<ChatMessage[]> {
  const result = await db.query(
    `SELECT cm.id, cm.conversation_id, cm.sender_id, cm.content, cm.message_type, cm.attachment_url, cm.file_type,
            cm.is_read, cm.created_at,
            u.full_name AS sender_name, u.username AS sender_username, s_r.legacy_role_id AS sender_role_id
     FROM chat_messages cm
     JOIN chat_conversations c ON c.id = cm.conversation_id AND c.organization_id = $2
     JOIN users u ON u.id = cm.sender_id
     ${roleJoin('u', '$2', 's')}
     WHERE cm.conversation_id = $1
     ORDER BY cm.created_at ASC, cm.id ASC`,
    [conversationId, tenant.organizationId],
  );
  return result.rows;
}

export async function findMessage(
  db: Queryable,
  tenant: Tenant,
  messageId: number,
): Promise<ChatMessage | null> {
  const result = await db.query(
    `SELECT cm.id, cm.conversation_id, cm.sender_id, cm.content, cm.message_type, cm.attachment_url, cm.file_type,
            cm.is_read, cm.created_at,
            u.full_name AS sender_name, u.username AS sender_username, s_r.legacy_role_id AS sender_role_id
     FROM chat_messages cm
     JOIN chat_conversations c ON c.id = cm.conversation_id AND c.organization_id = $2
     JOIN users u ON u.id = cm.sender_id
     ${roleJoin('u', '$2', 's')}
     WHERE cm.id = $1`,
    [messageId, tenant.organizationId],
  );
  return result.rows[0] ?? null;
}

export async function touchLastRead(
  db: Queryable,
  conversationId: number,
  userId: number,
): Promise<void> {
  await db.query(
    'UPDATE chat_participants SET last_read_at = CURRENT_TIMESTAMP WHERE conversation_id = $1 AND user_id = $2',
    [conversationId, userId],
  );
}

export async function markRead(
  db: Queryable,
  conversationId: number,
  userId: number,
): Promise<void> {
  await db.query(
    'UPDATE chat_messages SET is_read = true WHERE conversation_id = $1 AND sender_id != $2 AND is_read = false',
    [conversationId, userId],
  );
}

/** Existing 1:1 conversation between exactly these two users in the tenant. */
export async function findDirect(db: Queryable, tenant: Tenant, userIds: [number, number]) {
  const result = await db.query(
    `SELECT c.id, c.name FROM chat_conversations c
     WHERE c.organization_id = $1 AND c.is_group = false
       AND c.id IN (
         SELECT conversation_id FROM chat_participants GROUP BY conversation_id
         HAVING COUNT(*) = 2 AND bool_and(user_id = ANY($2::int[]))
       )
     LIMIT 1`,
    [tenant.organizationId, userIds],
  );
  return (result.rows[0] as { id: number; name: string } | undefined) ?? null;
}

export async function insertConversation(
  db: Queryable,
  tenant: Tenant,
  data: { name: string; isGroup: boolean; createdBy: number },
  participantIds: number[],
): Promise<number> {
  const result = await db.query(
    `INSERT INTO chat_conversations (organization_id, name, is_group, created_by) VALUES ($1, $2, $3, $4) RETURNING id`,
    [tenant.organizationId, data.name, data.isGroup, data.createdBy],
  );
  const id: number = result.rows[0].id;
  await db.query(
    'INSERT INTO chat_participants (conversation_id, user_id) SELECT $1, unnest($2::int[])',
    [id, participantIds],
  );
  return id;
}

export async function insertMessage(
  db: Queryable,
  data: {
    conversationId: number;
    senderId: number;
    content: string;
    messageType: string;
    attachmentUrl: string | null;
    fileType: string | null;
  },
): Promise<number> {
  const result = await db.query(
    `INSERT INTO chat_messages (conversation_id, sender_id, content, message_type, attachment_url, file_type)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [
      data.conversationId,
      data.senderId,
      data.content,
      data.messageType,
      data.attachmentUrl,
      data.fileType,
    ],
  );
  return result.rows[0].id;
}

/** Presence flag on the user's conversations in this tenant; returns affected conversation ids. */
export async function setPresence(
  db: Queryable,
  tenant: Tenant,
  userId: number,
  storedFlag: boolean,
): Promise<number[]> {
  const result = await db.query(
    `UPDATE chat_participants p SET is_online = $1
     FROM chat_conversations c
     WHERE c.id = p.conversation_id AND c.organization_id = $3 AND p.user_id = $2
     RETURNING p.conversation_id`,
    [storedFlag, userId, tenant.organizationId],
  );
  return result.rows.map((row: { conversation_id: number }) => row.conversation_id);
}

export async function participants(
  db: Queryable,
  tenant: Tenant,
  conversationId: number,
): Promise<ChatParticipant[]> {
  const result = await db.query(
    `SELECT cp.user_id, cp.is_online, cp.last_read_at, u.full_name, u.username, p_r.legacy_role_id AS role_id
     FROM chat_participants cp
     JOIN chat_conversations c ON c.id = cp.conversation_id AND c.organization_id = $2
     JOIN users u ON u.id = cp.user_id
     ${roleJoin('u', '$2', 'p')}
     WHERE cp.conversation_id = $1
     ORDER BY u.full_name ASC`,
    [conversationId, tenant.organizationId],
  );
  return result.rows;
}

export async function displayName(db: Queryable, userId: number): Promise<string | null> {
  const result = await db.query(
    'SELECT COALESCE(full_name, username) AS name FROM users WHERE id = $1',
    [userId],
  );
  return result.rows[0]?.name ?? null;
}
