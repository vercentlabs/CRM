import {
  createCalendarEventSchema,
  createTaskSchema,
  TASK_PRIORITIES,
  TASK_STATUSES,
  updateCalendarEventSchema,
  updateTaskSchema,
} from '@crm/validation';
import { z } from 'zod';
import {
  idParams,
  offsetOf,
  optionalDate,
  pageQuery,
  sortQuery,
} from '../../platform/http/query.js';
import { controller, created, ok, paginationMeta } from '../../platform/http/route.js';
import { actorFrom } from '../../platform/tenancy.js';
import { TASK_SORTS } from './tasks.repository.js';
import * as service from './tasks.service.js';

export const taskSchema = z.object({
  id: z.number(),
  title: z.string(),
  description: z.string().nullable(),
  due_date: z.string(),
  priority: z.enum(TASK_PRIORITIES),
  status: z.enum(TASK_STATUSES),
  assigned_to: z.number().nullable(),
  created_by: z.number(),
  created_at: z.string(),
  updated_at: z.string(),
  assigned_to_name: z.string().nullable(),
  assigned_to_email: z.string().nullable(),
});

export const calendarEventSchema = z.object({
  id: z.number(),
  title: z.string(),
  description: z.string().nullable(),
  start_date: z.string(),
  end_date: z.string(),
  priority: z.enum(TASK_PRIORITIES),
  status: z.enum(TASK_STATUSES),
  user_id: z.number().nullable(),
  user_name: z.string().nullable(),
  event_type: z.literal('task'),
});

const listQuery = z.object({
  ...pageQuery,
  status: z.enum(TASK_STATUSES).optional(),
  due_from: optionalDate,
  due_to: optionalDate,
  sort: sortQuery(TASK_SORTS, 'due_date'),
});

export const list = controller({
  query: listQuery,
  handle: async ({ auth, query }) => {
    const { items, total } = await service.listTasks(
      actorFrom(auth),
      { status: query.status, from: query.due_from, to: query.due_to },
      query.sort,
      { limit: query.limit, offset: offsetOf(query) },
    );
    return ok(items, paginationMeta(query.page, query.limit, total));
  },
});

export const get = controller({
  params: idParams,
  handle: async ({ auth, params }) => ok(await service.getTask(actorFrom(auth), params.id)),
});

export const create = controller({
  body: createTaskSchema,
  handle: async ({ auth, body }) => created(await service.createTask(actorFrom(auth), body)),
});

export const update = controller({
  params: idParams,
  body: updateTaskSchema,
  handle: async ({ auth, params, body }) =>
    ok(await service.updateTask(actorFrom(auth), params.id, body)),
});

export const remove = controller({
  params: idParams,
  handle: async ({ auth, params }) => {
    await service.deleteTask(actorFrom(auth), params.id);
    return ok({ deleted: true });
  },
});

// ---------------------------------------------------------------- calendar projection
const eventsQuery = z.object({ from: optionalDate, to: optionalDate });

/** Calendar = tasks in a date window (unpaginated window view, like the month grid needs). */
export const listEvents = controller({
  query: eventsQuery,
  handle: async ({ auth, query }) => {
    const { items } = await service.listTasks(
      actorFrom(auth),
      { from: query.from, to: query.to },
      't.due_date ASC',
      'all',
    );
    return ok(items.map(service.toCalendarEvent));
  },
});

export const createEvent = controller({
  body: createCalendarEventSchema,
  handle: async ({ auth, body }) => {
    const task = await service.createTask(
      actorFrom(auth),
      {
        title: body.title,
        description: body.description,
        due_date: body.start_date,
        priority: body.priority,
        status: body.status,
        assigned_to: body.user_id,
      },
      { defaultToSelf: true, audit: false },
    );
    return created(service.toCalendarEvent(task));
  },
});

export const updateEvent = controller({
  params: idParams,
  body: updateCalendarEventSchema,
  handle: async ({ auth, params, body }) => {
    const task = await service.updateTask(
      actorFrom(auth),
      params.id,
      {
        title: body.title,
        description: body.description,
        due_date: body.start_date,
        priority: body.priority,
        status: body.status,
        assigned_to: body.user_id,
      },
      { noun: 'event', audit: false },
    );
    return ok(service.toCalendarEvent(task));
  },
});

export const removeEvent = controller({
  params: idParams,
  handle: async ({ auth, params }) => {
    await service.deleteTask(actorFrom(auth), params.id, { noun: 'event', audit: false });
    return ok({ deleted: true });
  },
});
