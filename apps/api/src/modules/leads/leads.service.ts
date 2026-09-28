import { withTransaction } from '@crm/database';
import type { Lead } from '@crm/types';
import type {
  assignmentSchema,
  createFollowupSchema,
  createLeadSchema,
  updateLeadSchema,
} from '@crm/validation';
import type { z } from 'zod';
import { recordAuditEvent } from '../../platform/audit.js';
import { pool } from '../../platform/db.js';
import { emit } from '../../platform/events.js';
import { AppError } from '../../platform/http/errors.js';
import {
  assertMember,
  can,
  ownerFilter,
  requireScopeOf,
  type Actor,
} from '../../platform/tenancy.js';
import * as customers from '../customers/customers.repository.js';
import * as followups from '../followups/followups.repository.js';
import * as locations from '../locations/locations.repository.js';
import * as leads from './leads.repository.js';

export type CreateLeadInput = z.output<typeof createLeadSchema>;
export type UpdateLeadInput = z.output<typeof updateLeadSchema>;
export type AssignmentInput = z.output<typeof assignmentSchema>;
export type CreateFollowupInput = z.output<typeof createFollowupSchema>;

export interface LeadListQuery {
  status?: string | undefined;
  assignedTo?: number | undefined;
  dateFrom?: string | undefined;
  dateTo?: string | undefined;
  search?: string | undefined;
  orderBy: string;
  page: number;
  limit: number;
}

const NOT_FOUND = 'Lead not found';

async function assertLocation(actor: Actor, locationId: number | null | undefined) {
  if (locationId === null || locationId === undefined) return;
  if (!(await locations.exists(pool, actor, locationId))) {
    throw AppError.validation([{ field: 'location_id', message: 'Sales location not found' }]);
  }
}

/** Visibility rule shared by read paths: 404 outside the org, 403 outside own scope. */
async function loadVisible(
  actor: Actor,
  id: number,
  permission: 'crm.leads.read' | 'crm.leads.update',
): Promise<Lead> {
  const lead = await leads.findById(pool, actor, id);
  if (!lead) throw AppError.notFound(NOT_FOUND);
  if (ownerFilter(actor, permission) !== null && !leads.isOwnLead(lead, actor.userId)) {
    throw AppError.forbidden(
      permission === 'crm.leads.read'
        ? 'You do not have permission to view this lead'
        : 'You cannot update leads assigned to another sales executive',
    );
  }
  return lead;
}

export async function listLeads(actor: Actor, query: LeadListQuery) {
  const { rows, total } = await leads.list(
    pool,
    actor,
    {
      ownerId: ownerFilter(actor, 'crm.leads.read'),
      status: query.status,
      assignedTo: query.assignedTo,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      search: query.search,
    },
    query.orderBy,
    { limit: query.limit, offset: (query.page - 1) * query.limit },
  );
  return { items: rows, total };
}

export const getLead = (actor: Actor, id: number) => loadVisible(actor, id, 'crm.leads.read');

/**
 * Own-scope creators are always the assignee; organization-scope creators may
 * assign to another active member only with crm.leads.assign.
 */
export async function createLead(actor: Actor, input: CreateLeadInput): Promise<Lead> {
  let assignedTo: number | null = null;
  if (requireScopeOf(actor, 'crm.leads.create') === 'own') {
    if (input.assigned_to != null && input.assigned_to !== actor.userId) {
      throw AppError.forbidden('Sales users can only assign leads to themselves');
    }
    assignedTo = actor.userId;
  } else if (input.assigned_to != null) {
    if (input.assigned_to !== actor.userId && !can(actor, 'crm.leads.assign')) {
      throw AppError.forbidden('You cannot assign leads to other members');
    }
    await assertMember(pool, actor, input.assigned_to);
    assignedTo = input.assigned_to;
  }
  await assertLocation(actor, input.location_id);

  const id = await withTransaction(pool, async (tx) => {
    const created = await leads.insert(
      tx,
      actor,
      { ...input, assigned_to: assignedTo },
      actor.userId,
    );
    await emit(tx, actor, 'lead.created', created, { leadId: created, assignedTo });
    if (assignedTo !== null) {
      await emit(tx, actor, 'lead.assigned', created, {
        leadId: created,
        assignedTo,
        previousAssignedTo: null,
      });
    }
    return created;
  });
  const { assigned_to: _ignored, ...auditValues } = input;
  await recordAuditEvent({
    action: 'CREATE_LEAD',
    tableName: 'leads',
    recordId: id,
    newValues: { ...auditValues, assigned_to: assignedTo },
  });
  return (await leads.findById(pool, actor, id))!;
}

/**
 * Updates a lead. Changing the assignee to someone else needs org-scope update
 * + crm.leads.assign; converting (status → Converted) creates the customer in
 * the same organization atomically with the status change.
 */
export async function updateLead(actor: Actor, id: number, patch: UpdateLeadInput) {
  const current = await loadVisible(actor, id, 'crm.leads.update');
  const ownScope = ownerFilter(actor, 'crm.leads.update') !== null;

  if (patch.assigned_to !== undefined) {
    if (ownScope || !can(actor, 'crm.leads.assign')) {
      if (patch.assigned_to !== actor.userId) {
        throw AppError.forbidden('Sales users can only assign leads to themselves');
      }
    } else {
      await assertMember(pool, actor, patch.assigned_to);
    }
  }
  await assertLocation(actor, patch.location_id);

  const converting = patch.status === 'Converted' && current.status !== 'Converted';
  const { updatedFields, customerId } = await withTransaction(pool, async (client) => {
    const updatedFields = await leads.update(client, actor, id, patch);
    if (patch.status !== undefined && patch.status !== current.status) {
      await emit(client, actor, 'lead.status_changed', id, {
        leadId: id,
        from: current.status,
        to: patch.status,
      });
    }
    if (patch.assigned_to !== undefined && patch.assigned_to !== current.assigned_to) {
      await emit(client, actor, 'lead.assigned', id, {
        leadId: id,
        assignedTo: patch.assigned_to,
        previousAssignedTo: current.assigned_to,
      });
    }
    let customerId: number | null = null;
    if (converting) {
      const lead = (await leads.findById(client, actor, id))!;
      if (lead.email) {
        customerId = await customers.insertIfAbsent(client, actor, {
          name: lead.full_name,
          email: lead.email,
          phone: lead.mobile_number,
          address: lead.address,
          assigned_to: lead.assigned_to,
          created_by: actor.userId,
        });
        if (customerId !== null) {
          await emit(client, actor, 'customer.created', customerId, { customerId, leadId: id });
        }
      }
    }
    return { updatedFields, customerId };
  });

  if (patch.status !== undefined && patch.status !== current.status) {
    await recordAuditEvent({
      action: 'UPDATE_LEAD_STATUS',
      tableName: 'leads',
      recordId: id,
      oldValues: { status: current.status },
      newValues: { status: patch.status, updated_by: actor.userId },
    });
  }
  if (customerId !== null) {
    await recordAuditEvent({
      action: 'LEAD_CONVERTED_TO_CUSTOMER',
      tableName: 'customers',
      recordId: customerId,
      newValues: { leadId: id, email: current.email },
    });
  }
  return { lead: (await leads.findById(pool, actor, id))!, updatedFields };
}

/** Reassigns a lead (organization-scope crm.leads.assign; enforced by the route). */
export async function assignLead(actor: Actor, id: number, input: AssignmentInput): Promise<Lead> {
  await assertMember(pool, actor, input.assigned_to);
  const previous = await withTransaction(pool, async (client) => {
    const locked = await leads.lockById(client, actor, id);
    if (!locked) throw AppError.notFound(NOT_FOUND);
    await leads.update(client, actor, id, { assigned_to: input.assigned_to });
    if (locked.assigned_to !== input.assigned_to) {
      await emit(client, actor, 'lead.assigned', id, {
        leadId: id,
        assignedTo: input.assigned_to,
        previousAssignedTo: locked.assigned_to,
      });
    }
    return locked.assigned_to;
  });
  await recordAuditEvent({
    action: 'ASSIGN_LEAD',
    tableName: 'leads',
    recordId: id,
    oldValues: { assigned_to: previous },
    newValues: { assigned_to: input.assigned_to, changed_by: actor.userId },
  });
  return (await leads.findById(pool, actor, id))!;
}

/**
 * Schedules a follow-up: only the lead's assignee may do this; the follow-up
 * insert and the lead's next_call_at update are one transaction.
 */
export async function createFollowupForLead(
  actor: Actor,
  leadId: number,
  input: CreateFollowupInput,
) {
  const result = await withTransaction(pool, async (client) => {
    const lead = await leads.lockById(client, actor, leadId);
    if (!lead) throw AppError.notFound(NOT_FOUND);
    if (lead.assigned_to !== actor.userId) {
      throw AppError.forbidden('You can only create followups for leads assigned to you');
    }
    const followup = await followups.insert(client, actor, {
      lead_id: leadId,
      assigned_to: actor.userId,
      followup_date: input.scheduled_at,
      followup_type: input.followup_type,
      notes: input.notes ?? null,
    });
    await leads.update(client, actor, leadId, { next_call_at: input.scheduled_at });
    await emit(client, actor, 'followup.scheduled', followup.id, {
      followupId: followup.id,
      leadId,
      assignedTo: actor.userId,
      scheduledAt: new Date(input.scheduled_at).toISOString(),
    });
    return followup;
  });
  await recordAuditEvent({
    action: 'CREATE_FOLLOWUP',
    tableName: 'followups',
    recordId: result.id,
    newValues: { lead_id: leadId, scheduled_at: input.scheduled_at, created_by: actor.userId },
  });
  return { followup: result, lead: (await leads.findById(pool, actor, leadId))! };
}
