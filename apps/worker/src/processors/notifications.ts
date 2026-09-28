import type { DomainEvent } from '@crm/events';
import * as notifications from '../db/notifications.js';
import { loadEvent } from '../db/outbox.js';
import type { WorkerDeps } from '../jobs/context.js';
import type { JobPayload } from '../jobs/definitions.js';

/**
 * Turns selected domain events into in-app notifications for the one member
 * who needs to act (never the actor themselves, never unrelated members).
 * The dedupe key is the event id, so replays create nothing new.
 */
export async function notifyFromEvent(deps: WorkerDeps, job: JobPayload<'notification.event'>) {
  const event = await loadEvent(deps.db, job.organizationId, job.eventId);
  if (!event) {
    deps.logger.warn('notification_event_missing', job);
    return;
  }
  const notification = await describe(deps, event, job.organizationId);
  if (!notification || notification.userId === event.actorUserId) return;
  await notifications.notify(deps.db, {
    ...notification,
    organizationId: job.organizationId,
    dedupeKey: `event.${event.id}`,
  });
}

async function describe(
  deps: WorkerDeps,
  event: DomainEvent,
  organizationId: number,
): Promise<Omit<notifications.NewNotification, 'organizationId' | 'dedupeKey'> | null> {
  switch (event.type) {
    case 'lead.assigned': {
      const payload = event.payload as DomainEvent<'lead.assigned'>['payload'];
      if (payload.assignedTo === null) return null;
      const name = await notifications.leadName(deps.db, organizationId, payload.leadId);
      if (name === null) return null;
      return {
        userId: payload.assignedTo,
        type: 'lead.assigned',
        title: 'Lead assigned to you',
        body: name,
        entity: { type: 'lead', id: payload.leadId },
      };
    }
    case 'task.assigned': {
      const payload = event.payload as DomainEvent<'task.assigned'>['payload'];
      const title = await notifications.taskTitle(deps.db, organizationId, payload.taskId);
      if (title === null) return null;
      return {
        userId: payload.assignedTo,
        type: 'task.assigned',
        title: 'Task assigned to you',
        body: title,
        entity: { type: 'task', id: payload.taskId },
      };
    }
    case 'opportunity.stage_changed': {
      const payload = event.payload as DomainEvent<'opportunity.stage_changed'>['payload'];
      const opportunity = await notifications.opportunity(
        deps.db,
        organizationId,
        payload.opportunityId,
      );
      if (!opportunity || opportunity.assigned_to === null) return null;
      return {
        userId: opportunity.assigned_to,
        type: 'opportunity.stage_changed',
        title: `Opportunity moved to ${payload.to}`,
        body: opportunity.title,
        entity: { type: 'opportunity', id: payload.opportunityId },
      };
    }
    default:
      return null;
  }
}

/** Recurring reminder scan (idempotent per due time; see db/notifications). */
export async function scanReminders(deps: WorkerDeps) {
  const created = await notifications.createDueReminders(deps.db, {
    followupDueMinutes: 15,
    taskDueMinutes: 60,
    overdueLookbackDays: 7,
  });
  if (created.followupsDue + created.followupsOverdue + created.tasksDue > 0) {
    deps.logger.info('reminders_created', created);
  }
}
