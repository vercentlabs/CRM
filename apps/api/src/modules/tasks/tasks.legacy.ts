import {
  createCalendarEventSchema,
  createTaskSchema,
  updateCalendarEventSchema,
  updateTaskSchema,
} from '@crm/validation';
import { Router } from 'express';
import { legacyId, legacyRoute } from '../../platform/http/legacy.js';
import * as service from './tasks.service.js';

/** DEPRECATED `/tasks/*` adapters → tasks.service. */
export function legacyTasksRouter(): Router {
  const router = Router();

  router.get(
    '/',
    ...legacyRoute({
      permission: 'crm.tasks.read',
      handle: async ({ actor, res }) => {
        const { items } = await service.listTasks(actor, {}, 't.due_date ASC', 'all');
        res.status(200).json({ message: 'Tasks retrieved successfully', tasks: items });
      },
    }),
  );

  router.post(
    '/',
    ...legacyRoute({
      permission: 'crm.tasks.create',
      body: createTaskSchema,
      handle: async ({ actor, body, res }) => {
        const task = await service.createTask(actor, body);
        res.status(201).json({ message: 'Task created successfully', task });
      },
    }),
  );

  router.patch(
    '/:id',
    ...legacyRoute({
      permission: 'crm.tasks.update',
      body: updateTaskSchema,
      handle: async ({ actor, body, req, res }) => {
        const task = await service.updateTask(
          actor,
          legacyId(req.params.id, 'Task not found'),
          body,
        );
        res.status(200).json({ message: 'Task updated successfully', task });
      },
    }),
  );

  router.delete(
    '/:id',
    ...legacyRoute({
      permission: 'crm.tasks.delete',
      handle: async ({ actor, req, res }) => {
        await service.deleteTask(actor, legacyId(req.params.id, 'Task not found'));
        res.status(200).json({ message: 'Task deleted successfully' });
      },
    }),
  );

  return router;
}

/** DEPRECATED `/calendar/*` adapters → tasks.service (calendar projection). */
export function legacyCalendarRouter(): Router {
  const router = Router();

  router.get(
    '/',
    ...legacyRoute({
      permission: 'crm.tasks.read',
      handle: async ({ actor, res }) => {
        const { items } = await service.listTasks(actor, {}, 't.due_date ASC', 'all');
        res.status(200).json({
          message: 'Events retrieved successfully',
          events: items.map(service.toCalendarEvent),
        });
      },
    }),
  );

  router.post(
    '/',
    ...legacyRoute({
      permission: 'crm.tasks.create',
      body: createCalendarEventSchema,
      handle: async ({ actor, body, res }) => {
        const task = await service.createTask(
          actor,
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
        // Historical response returned the raw task row as `event`.
        res.status(201).json({ message: 'Event created successfully', event: task });
      },
    }),
  );

  router.patch(
    '/:id',
    ...legacyRoute({
      permission: 'crm.tasks.update',
      body: updateCalendarEventSchema,
      handle: async ({ actor, body, req, res }) => {
        const task = await service.updateTask(
          actor,
          legacyId(req.params.id, 'Event not found'),
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
        res.status(200).json({ message: 'Event updated successfully', event: task });
      },
    }),
  );

  router.delete(
    '/:id',
    ...legacyRoute({
      permission: 'crm.tasks.delete',
      handle: async ({ actor, req, res }) => {
        await service.deleteTask(actor, legacyId(req.params.id, 'Event not found'), {
          noun: 'event',
          audit: false,
        });
        res.status(200).json({ message: 'Event deleted successfully' });
      },
    }),
  );

  return router;
}
