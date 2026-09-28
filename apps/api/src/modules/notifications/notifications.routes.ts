import { booleanLike } from '@crm/validation';
import { z } from 'zod';
import { offsetOf, pageQuery } from '../../platform/http/query.js';
import { controller, ok, paginationMeta, type ApiModule } from '../../platform/http/route.js';
import { actorFrom } from '../../platform/tenancy.js';
import * as service from './notifications.service.js';

export const notificationSchema = z.object({
  id: z.uuid(),
  type: z.string(),
  title: z.string(),
  body: z.string().nullable(),
  entity_type: z.enum(['lead', 'task', 'opportunity']).nullable(),
  entity_id: z.number().nullable(),
  read_at: z.string().nullable(),
  created_at: z.string(),
});

const list = controller({
  query: z.object({ ...pageQuery, unread: booleanLike.optional() }),
  handle: async ({ auth, query }) => {
    const { rows, total } = await service.listNotifications(
      actorFrom(auth),
      query.unread === true,
      {
        limit: query.limit,
        offset: offsetOf(query),
      },
    );
    return ok(rows, paginationMeta(query.page, query.limit, total));
  },
});

const unread = controller({
  handle: async ({ auth }) => ok({ count: await service.unreadCount(actorFrom(auth)) }),
});

const markRead = controller({
  params: z.object({ id: z.uuid() }),
  handle: async ({ auth, params }) => {
    await service.markRead(actorFrom(auth), params.id);
    return ok({ read: true });
  },
});

const markAllRead = controller({
  handle: async ({ auth }) => ok({ updated: await service.markAllRead(actorFrom(auth)) }),
});

const tags = ['Notifications'];

/** Personal notifications: no permission beyond an active membership; always the caller's own. */
export const notificationsModule: ApiModule = {
  name: 'notifications',
  routes: [
    {
      method: 'get',
      path: '/notifications',
      summary: 'My notifications in the active organization (newest first; ?unread=true)',
      tags,
      controller: list,
      response: notificationSchema.array(),
      paginated: true,
    },
    {
      method: 'get',
      path: '/notifications/unread-count',
      summary: 'Number of my unread notifications',
      tags,
      controller: unread,
      response: z.object({ count: z.number() }),
    },
    {
      method: 'post',
      path: '/notifications/:id/read',
      summary: 'Mark one of my notifications as read',
      tags,
      controller: markRead,
      response: z.object({ read: z.literal(true) }),
    },
    {
      method: 'post',
      path: '/notifications/read-all',
      summary: 'Mark all my notifications as read',
      tags,
      controller: markAllRead,
      response: z.object({ updated: z.number() }),
    },
  ],
};
