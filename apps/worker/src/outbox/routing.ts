import { WEBHOOK_EVENT_TYPES, type DomainEvent } from '@crm/events';
import { jobId } from '../jobs/definitions.js';
import type { EnqueueRequest } from '../queue/types.js';

const NOTIFYING = new Set(['lead.assigned', 'task.assigned', 'opportunity.stage_changed']);
const WEBHOOK = new Set<string>(WEBHOOK_EVENT_TYPES);

/**
 * Event → jobs. Job ids derive from the event id, so dispatching the same
 * event twice (e.g. after a crash between enqueue and "processed") never
 * duplicates work. Tenant jobs always carry the event's organization.
 */
export function routeEvent(event: DomainEvent): EnqueueRequest[] {
  const jobs: EnqueueRequest[] = [];
  const org = event.organizationId;
  const add = (name: EnqueueRequest['name'], payload: Record<string, unknown>) =>
    jobs.push({ name, payload, id: jobId(event.id, name) });

  if (event.type === 'auth.password_reset_requested') {
    const payload = event.payload as DomainEvent<'auth.password_reset_requested'>['payload'];
    add('email.password_reset', { passwordResetId: payload.passwordResetId });
    return jobs;
  }
  if (org === null) throw new Error(`Tenant event ${event.type} has no organization`);

  if (event.type === 'message.requested') {
    const payload = event.payload as DomainEvent<'message.requested'>['payload'];
    add('message.send', { organizationId: org, messageId: payload.messageId });
  }
  if (event.type === 'member.invited') {
    const payload = event.payload as DomainEvent<'member.invited'>['payload'];
    add('email.member_invitation', { organizationId: org, membershipId: payload.membershipId });
  }
  if (event.type === 'file.deleted') {
    const payload = event.payload as DomainEvent<'file.deleted'>['payload'];
    add('file.delete_object', { organizationId: org, fileId: payload.fileId });
  }
  if (NOTIFYING.has(event.type))
    add('notification.event', { organizationId: org, eventId: event.id });
  if (WEBHOOK.has(event.type)) add('webhook.fanout', { organizationId: org, eventId: event.id });
  return jobs;
}
