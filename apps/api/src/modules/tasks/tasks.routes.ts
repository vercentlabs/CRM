import { z } from 'zod';
import type { ApiModule } from '../../platform/http/route.js';
import * as tasks from './tasks.controller.js';
import { calendarEventSchema, taskSchema } from './tasks.controller.js';

const deleted = z.object({ deleted: z.literal(true) });

export const tasksModule: ApiModule = {
  name: 'tasks',
  routes: [
    {
      method: 'get',
      path: '/tasks',
      summary: 'List tasks (own scope: assigned to me)',
      tags: ['Tasks'],
      permission: 'crm.tasks.read',
      controller: tasks.list,
      response: taskSchema.array(),
      paginated: true,
    },
    {
      method: 'post',
      path: '/tasks',
      summary: 'Create a task',
      tags: ['Tasks'],
      permission: 'crm.tasks.create',
      controller: tasks.create,
      response: taskSchema,
      successStatus: 201,
    },
    {
      method: 'get',
      path: '/tasks/:id',
      summary: 'Get a task',
      tags: ['Tasks'],
      permission: 'crm.tasks.read',
      controller: tasks.get,
      response: taskSchema,
    },
    {
      method: 'patch',
      path: '/tasks/:id',
      summary: 'Update a task',
      tags: ['Tasks'],
      permission: 'crm.tasks.update',
      controller: tasks.update,
      response: taskSchema,
    },
    {
      method: 'delete',
      path: '/tasks/:id',
      summary: 'Delete a task (permanent)',
      tags: ['Tasks'],
      permission: 'crm.tasks.delete',
      controller: tasks.remove,
      response: deleted,
    },
  ],
};

/** Calendar is a projection over tasks (same rows, same permissions). */
export const calendarModule: ApiModule = {
  name: 'calendar',
  routes: [
    {
      method: 'get',
      path: '/calendar/events',
      summary: 'Calendar events (tasks) in an optional date window',
      tags: ['Calendar'],
      permission: 'crm.tasks.read',
      controller: tasks.listEvents,
      response: calendarEventSchema.array(),
    },
    {
      method: 'post',
      path: '/calendar/events',
      summary: 'Create a calendar event (a task assigned to me by default)',
      tags: ['Calendar'],
      permission: 'crm.tasks.create',
      controller: tasks.createEvent,
      response: calendarEventSchema,
      successStatus: 201,
    },
    {
      method: 'patch',
      path: '/calendar/events/:id',
      summary: 'Update a calendar event',
      tags: ['Calendar'],
      permission: 'crm.tasks.update',
      controller: tasks.updateEvent,
      response: calendarEventSchema,
    },
    {
      method: 'delete',
      path: '/calendar/events/:id',
      summary: 'Delete a calendar event',
      tags: ['Calendar'],
      permission: 'crm.tasks.delete',
      controller: tasks.removeEvent,
      response: deleted,
    },
  ],
};
