import { withTransaction } from '@crm/database';
import type { CalendarEvent, Task } from '@crm/types';
import type { createTaskSchema, updateTaskSchema } from '@crm/validation';
import type { z } from 'zod';
import { recordAuditEvent } from '../../platform/audit.js';
import { pool } from '../../platform/db.js';
import { emit } from '../../platform/events.js';
import { AppError } from '../../platform/http/errors.js';
import { assertMember, ownerFilter, type Actor } from '../../platform/tenancy.js';
import * as tasks from './tasks.repository.js';

/**
 * Tasks. Calendar events are the same rows viewed through `toCalendarEvent`
 * (start_date = end_date = due_date, user_id = assigned_to); both surfaces use
 * crm.tasks.* permissions and OWN scope = assigned to me.
 */

export type CreateTaskInput = z.output<typeof createTaskSchema>;
export type UpdateTaskInput = z.output<typeof updateTaskSchema>;

type Noun = 'task' | 'event';
const titled = (noun: Noun) => (noun === 'task' ? 'Task' : 'Event');

async function resolveAssignee(
  actor: Actor,
  permission: 'crm.tasks.create' | 'crm.tasks.update',
  requested: number | null | undefined,
  defaultToSelf: boolean,
): Promise<number | null> {
  if (ownerFilter(actor, permission) !== null) {
    if (requested != null && requested !== actor.userId) {
      throw AppError.forbidden('You can only assign tasks to yourself');
    }
    return actor.userId;
  }
  await assertMember(pool, actor, requested);
  return requested ?? (defaultToSelf ? actor.userId : null);
}

async function loadScoped(
  actor: Actor,
  id: number,
  permission: 'crm.tasks.read' | 'crm.tasks.update' | 'crm.tasks.delete',
  noun: Noun,
): Promise<Task> {
  const task = await tasks.findById(pool, actor, id);
  if (!task) throw AppError.notFound(`${titled(noun)} not found`);
  const owner = ownerFilter(actor, permission);
  if (owner !== null && task.assigned_to !== owner) {
    const verb =
      permission === 'crm.tasks.delete'
        ? 'delete'
        : permission === 'crm.tasks.read'
          ? 'view'
          : 'update';
    throw AppError.forbidden(`You can only ${verb} your own ${noun}s`);
  }
  return task;
}

export async function listTasks(
  actor: Actor,
  filter: { status?: string | undefined; from?: string | undefined; to?: string | undefined },
  orderBy: string,
  paging: { limit: number; offset: number } | 'all',
) {
  const { rows, total } = await tasks.list(
    pool,
    actor,
    { ownerId: ownerFilter(actor, 'crm.tasks.read'), ...filter },
    orderBy,
    paging,
  );
  return { items: rows, total };
}

export const getTask = (actor: Actor, id: number, noun: Noun = 'task') =>
  loadScoped(actor, id, 'crm.tasks.read', noun);

export async function createTask(
  actor: Actor,
  input: CreateTaskInput,
  options: { defaultToSelf?: boolean; audit?: boolean } = {},
): Promise<Task> {
  const assignee = await resolveAssignee(
    actor,
    'crm.tasks.create',
    input.assigned_to,
    options.defaultToSelf ?? false,
  );
  const id = await withTransaction(pool, async (tx) => {
    const created = await tasks.insert(
      tx,
      actor,
      { ...input, assigned_to: assignee },
      actor.userId,
    );
    const task = (await tasks.findById(tx, actor, created))!;
    if (assignee !== null) {
      await emit(tx, actor, 'task.assigned', created, {
        taskId: created,
        assignedTo: assignee,
        dueDate: new Date(task.due_date).toISOString(),
      });
    }
    return created;
  });
  const task = (await tasks.findById(pool, actor, id))!;
  if (options.audit !== false) {
    await recordAuditEvent({
      action: 'CREATE_TASK',
      tableName: 'tasks',
      recordId: id,
      newValues: { title: task.title, assigned_to: task.assigned_to, due_date: task.due_date },
    });
  }
  return task;
}

export async function updateTask(
  actor: Actor,
  id: number,
  patch: UpdateTaskInput,
  options: { noun?: Noun; audit?: boolean } = {},
): Promise<Task> {
  const noun = options.noun ?? 'task';
  const before = await loadScoped(actor, id, 'crm.tasks.update', noun);
  const next = { ...patch };
  if (patch.assigned_to !== undefined) {
    next.assigned_to = await resolveAssignee(actor, 'crm.tasks.update', patch.assigned_to, false);
  }
  const task = await withTransaction(pool, async (tx) => {
    await tasks.update(tx, actor, id, next);
    const after = (await tasks.findById(tx, actor, id))!;
    if (after.assigned_to !== null && after.assigned_to !== before.assigned_to) {
      await emit(tx, actor, 'task.assigned', id, {
        taskId: id,
        assignedTo: after.assigned_to,
        dueDate: new Date(after.due_date).toISOString(),
      });
    }
    if (after.status === 'completed' && before.status !== 'completed') {
      await emit(tx, actor, 'task.completed', id, { taskId: id, assignedTo: after.assigned_to });
    }
    return after;
  });
  if (options.audit !== false) {
    await recordAuditEvent({
      action: 'UPDATE_TASK',
      tableName: 'tasks',
      recordId: id,
      newValues: { title: task.title, assigned_to: task.assigned_to, status: task.status },
    });
  }
  return task;
}

export async function deleteTask(
  actor: Actor,
  id: number,
  options: { noun?: Noun; audit?: boolean } = {},
): Promise<void> {
  const task = await loadScoped(actor, id, 'crm.tasks.delete', options.noun ?? 'task');
  await tasks.remove(pool, actor, id);
  if (options.audit !== false) {
    await recordAuditEvent({
      action: 'DELETE_TASK',
      tableName: 'tasks',
      recordId: id,
      oldValues: { title: task.title, assigned_to: task.assigned_to },
    });
  }
}

/** Calendar projection of a task row. */
export const toCalendarEvent = (task: Task): CalendarEvent => ({
  id: task.id,
  title: task.title,
  description: task.description,
  start_date: task.due_date,
  end_date: task.due_date,
  priority: task.priority,
  status: task.status,
  user_id: task.assigned_to,
  user_name: task.assigned_to_name,
  event_type: 'task',
});
