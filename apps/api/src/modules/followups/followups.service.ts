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
 * Completes a follow-up. Own scope may only complete follow-ups assigned to
 * them. "Overdue" is derived from the date, never stored.
 */
export async function completeFollowup(actor: Actor, id: number): Promise<Followup> {
  const status = 'Completed';
  const current = await followups.findById(pool, actor, id);
  if (!current) throw AppError.notFound('Followup not found');
  if (ownerFilter(actor, 'crm.followups.update') !== null && current.assigned_to !== actor.userId) {
    throw AppError.forbidden('You can only complete your own followups');
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
    action: 'COMPLETE_FOLLOWUP',
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
