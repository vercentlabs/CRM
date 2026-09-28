import { withTransaction } from '@crm/database';
import type { Opportunity } from '@crm/types';
import type {
  assignmentSchema,
  createOpportunitySchema,
  updateOpportunitySchema,
} from '@crm/validation';
import type { z } from 'zod';
import { recordAuditEvent } from '../../platform/audit.js';
import { pool } from '../../platform/db.js';
import { AppError } from '../../platform/http/errors.js';
import { assertMember, can, ownerFilter, type Actor } from '../../platform/tenancy.js';
import * as leads from '../leads/leads.repository.js';
import * as opportunities from './opportunities.repository.js';

export type CreateOpportunityInput = z.output<typeof createOpportunitySchema>;
export type UpdateOpportunityInput = z.output<typeof updateOpportunitySchema>;

const NOT_FOUND = 'Opportunity not found';

export async function listOpportunities(
  actor: Actor,
  query: {
    stage?: string | undefined;
    leadId?: number | undefined;
    orderBy: string;
    page: number;
    limit: number;
  },
) {
  const { rows, total } = await opportunities.list(
    pool,
    actor,
    {
      ownerId: ownerFilter(actor, 'crm.opportunities.read'),
      stage: query.stage,
      leadId: query.leadId,
    },
    query.orderBy,
    { limit: query.limit, offset: (query.page - 1) * query.limit },
  );
  return { items: rows, total };
}

export async function getOpportunity(actor: Actor, id: number): Promise<Opportunity> {
  const row = await opportunities.findById(pool, actor, id);
  if (!row) throw AppError.notFound(NOT_FOUND);
  if (
    ownerFilter(actor, 'crm.opportunities.read') !== null &&
    !opportunities.isOwnOpportunity(row, actor.userId)
  ) {
    throw AppError.forbidden('You do not have permission to view this opportunity');
  }
  return row;
}

/**
 * The linked lead must exist in this organization and be visible to the
 * caller (their lead scope); own-scope creators are always the assignee.
 */
export async function createOpportunity(
  actor: Actor,
  input: CreateOpportunityInput,
): Promise<Opportunity> {
  let assignedTo: number | null = null;
  if (ownerFilter(actor, 'crm.opportunities.create') !== null) {
    if (input.assigned_to != null && input.assigned_to !== actor.userId) {
      throw AppError.forbidden('Sales users can only assign opportunities to themselves');
    }
    assignedTo = actor.userId;
  } else if (input.assigned_to != null) {
    if (input.assigned_to !== actor.userId && !can(actor, 'crm.opportunities.assign')) {
      throw AppError.forbidden('You cannot assign opportunities to other members');
    }
    await assertMember(pool, actor, input.assigned_to);
    assignedTo = input.assigned_to;
  }

  const visible = await leads.visibleIds(
    pool,
    actor,
    [input.lead_id],
    ownerFilter(actor, 'crm.leads.read'),
  );
  if (visible.length === 0) throw AppError.notFound('Lead not found');

  const id = await opportunities.insert(
    pool,
    actor,
    { ...input, assigned_to: assignedTo },
    actor.userId,
  );
  await recordAuditEvent({
    action: 'CREATE_OPPORTUNITY',
    tableName: 'opportunities',
    recordId: id,
    newValues: { ...input, assigned_to: assignedTo },
  });
  return (await opportunities.findById(pool, actor, id))!;
}

export async function updateOpportunity(actor: Actor, id: number, patch: UpdateOpportunityInput) {
  const current = await opportunities.findById(pool, actor, id);
  if (!current) throw AppError.notFound(NOT_FOUND);
  if (
    ownerFilter(actor, 'crm.opportunities.update') !== null &&
    !opportunities.isOwnOpportunity(current, actor.userId)
  ) {
    throw AppError.forbidden('Forbidden: You can only update opportunities assigned to you');
  }
  const updatedFields = await opportunities.update(pool, actor, id, patch);
  if (patch.stage !== undefined && patch.stage !== current.stage) {
    await recordAuditEvent({
      action: 'UPDATE_OPPORTUNITY_STAGE',
      tableName: 'opportunities',
      recordId: id,
      oldValues: { stage: current.stage },
      newValues: { stage: patch.stage, updated_by: actor.userId },
    });
  }
  return { opportunity: (await opportunities.findById(pool, actor, id))!, updatedFields };
}

export async function assignOpportunity(
  actor: Actor,
  id: number,
  input: z.output<typeof assignmentSchema>,
) {
  await assertMember(pool, actor, input.assigned_to);
  const previous = await withTransaction(pool, async (client) => {
    const locked = await opportunities.lockById(client, actor, id);
    if (!locked) throw AppError.notFound(NOT_FOUND);
    await opportunities.update(client, actor, id, { assigned_to: input.assigned_to });
    return locked.assigned_to;
  });
  await recordAuditEvent({
    action: 'ASSIGN_OPPORTUNITY',
    tableName: 'opportunities',
    recordId: id,
    oldValues: { assigned_to: previous },
    newValues: { assigned_to: input.assigned_to, changed_by: actor.userId },
  });
  return (await opportunities.findById(pool, actor, id))!;
}
