import type { Followup } from '@crm/types';
import { recordAuditEvent } from '../../platform/audit.js';
import { pool } from '../../platform/db.js';
import { AppError } from '../../platform/http/errors.js';
import { ownerFilter, type Actor } from '../../platform/tenancy.js';
import * as followups from './followups.repository.js';

export const listSchedule = (actor: Actor, overdueOnly: boolean) =>
  followups.schedule(pool, actor, {
    ownerId: ownerFilter(actor, 'crm.followups.read'),
    overdueOnly,
  });

/**
 * Changes a follow-up's status. Own scope may only change follow-ups assigned
 * to them. 'Overdue' is kept for the legacy endpoint but is rejected by the
 * followups_status_check constraint (Pending/Completed/Cancelled), exactly as
 * before Phase 3.
 */
async function setStatus(
  actor: Actor,
  id: number,
  status: 'Completed' | 'Overdue',
  action: string,
): Promise<Followup> {
  const current = await followups.findById(pool, actor, id);
  if (!current) throw AppError.notFound('Followup not found');
  if (ownerFilter(actor, 'crm.followups.update') !== null && current.assigned_to !== actor.userId) {
    throw AppError.forbidden(
      status === 'Completed'
        ? 'You can only complete your own followups'
        : 'You can only mark your own followups as overdue',
    );
  }
  try {
    await followups.setStatus(pool, actor, id, status);
  } catch (error) {
    if ((error as { code?: string }).code === '23514') {
      throw AppError.badRequest(`Followup cannot be marked as ${status}`);
    }
    throw error;
  }
  await recordAuditEvent({
    action,
    tableName: 'followups',
    recordId: id,
    newValues: {
      lead_id: current.lead_id,
      followup_date: current.followup_date,
      status,
      changed_by: actor.userId,
    },
  });
  return (await followups.findById(pool, actor, id))!;
}

export const completeFollowup = (actor: Actor, id: number) =>
  setStatus(actor, id, 'Completed', 'COMPLETE_FOLLOWUP');
export const markFollowupOverdue = (actor: Actor, id: number) =>
  setStatus(actor, id, 'Overdue', 'MARK_FOLLOWUP_OVERDUE');
