import { pool } from '../../platform/db.js';
import { AppError } from '../../platform/http/errors.js';
import type { Actor } from '../../platform/tenancy.js';
import * as notifications from './notifications.repository.js';

/**
 * In-app notifications of the signed-in member. They are created by the
 * worker from domain events and reminders; the API only reads and marks them.
 * Access derives from the authenticated identity, not from a permission.
 */

export const listNotifications = (
  actor: Actor,
  unreadOnly: boolean,
  paging: { limit: number; offset: number },
) => notifications.list(pool, actor, actor.userId, { unreadOnly }, paging);

export const unreadCount = (actor: Actor) => notifications.unreadCount(pool, actor, actor.userId);

export async function markRead(actor: Actor, id: string): Promise<void> {
  if (!(await notifications.markRead(pool, actor, actor.userId, id))) {
    throw AppError.notFound('Notification not found');
  }
}

export const markAllRead = (actor: Actor) => notifications.markAllRead(pool, actor, actor.userId);
