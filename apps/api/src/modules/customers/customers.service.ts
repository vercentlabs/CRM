import type { Customer } from '@crm/types';
import type { createCustomerSchema, updateCustomerSchema } from '@crm/validation';
import type { z } from 'zod';
import { recordAuditEvent } from '../../platform/audit.js';
import { pool } from '../../platform/db.js';
import { AppError } from '../../platform/http/errors.js';
import { assertMember, ownerFilter, type Actor } from '../../platform/tenancy.js';
import * as customers from './customers.repository.js';

export type CreateCustomerInput = z.output<typeof createCustomerSchema>;
export type UpdateCustomerInput = z.output<typeof updateCustomerSchema>;

const NOT_FOUND = 'Customer not found';
const DUPLICATE = 'A customer with this email already exists';

/**
 * Own-scope members are always the assignee (and cannot hand a customer to
 * someone else); organization-scope members may assign any active member.
 */
async function resolveAssignee(
  actor: Actor,
  permission: 'crm.customers.create' | 'crm.customers.update',
  requested: number | null | undefined,
): Promise<number | null | undefined> {
  if (ownerFilter(actor, permission) !== null) {
    if (requested != null && requested !== actor.userId) {
      throw AppError.forbidden('You can only assign customers to yourself');
    }
    return actor.userId;
  }
  await assertMember(pool, actor, requested);
  return requested;
}

const isUniqueViolation = (error: unknown) => (error as { code?: string }).code === '23505';

export async function listCustomers(
  actor: Actor,
  orderBy: string,
  paging: { limit: number; offset: number } | 'all',
) {
  const { rows, total } = await customers.list(
    pool,
    actor,
    ownerFilter(actor, 'crm.customers.read'),
    orderBy,
    paging,
  );
  return { items: rows, total };
}

export async function getCustomer(actor: Actor, id: number): Promise<Customer> {
  const customer = await customers.findById(pool, actor, id);
  if (!customer) throw AppError.notFound(NOT_FOUND);
  const owner = ownerFilter(actor, 'crm.customers.read');
  if (owner !== null && customer.assigned_to !== owner) {
    throw AppError.forbidden('You do not have permission to view this customer');
  }
  return customer;
}

export async function createCustomer(actor: Actor, input: CreateCustomerInput): Promise<Customer> {
  const assignee = await resolveAssignee(actor, 'crm.customers.create', input.assigned_to);
  if (await customers.emailTaken(pool, actor, input.email)) throw AppError.conflict(DUPLICATE);
  try {
    const customer = await customers.insert(
      pool,
      actor,
      { ...input, assigned_to: assignee ?? null },
      actor.userId,
    );
    await recordAuditEvent({
      action: 'CUSTOMER_CREATED',
      tableName: 'customers',
      recordId: customer.id,
      newValues: { name: customer.name, email: customer.email, assignedTo: customer.assigned_to },
    });
    return customer;
  } catch (error) {
    if (isUniqueViolation(error)) throw AppError.conflict(DUPLICATE);
    throw error;
  }
}

export async function updateCustomer(
  actor: Actor,
  id: number,
  patch: UpdateCustomerInput,
): Promise<Customer> {
  const current = await customers.findById(pool, actor, id);
  if (!current) throw AppError.notFound(NOT_FOUND);
  const owner = ownerFilter(actor, 'crm.customers.update');
  if (owner !== null && current.assigned_to !== owner) {
    throw AppError.forbidden('You can only update customers assigned to you');
  }

  const next = { ...patch };
  if (patch.assigned_to !== undefined) {
    next.assigned_to = await resolveAssignee(actor, 'crm.customers.update', patch.assigned_to);
  }
  if (
    patch.email !== undefined &&
    patch.email !== current.email &&
    (await customers.emailTaken(pool, actor, patch.email, id))
  ) {
    throw AppError.conflict(DUPLICATE);
  }

  try {
    const updated = (await customers.update(pool, actor, id, next))!;
    await recordAuditEvent({
      action: 'CUSTOMER_UPDATED',
      tableName: 'customers',
      recordId: id,
      oldValues: current,
      newValues: { name: updated.name, email: updated.email, assignedTo: updated.assigned_to },
    });
    return updated;
  } catch (error) {
    if (isUniqueViolation(error)) throw AppError.conflict(DUPLICATE);
    throw error;
  }
}

/** Permanent delete (historical behaviour; there is no soft delete for customers). */
export async function deleteCustomer(actor: Actor, id: number): Promise<void> {
  const removed = await customers.remove(pool, actor, id);
  if (!removed) throw AppError.notFound(NOT_FOUND);
  await recordAuditEvent({
    action: 'CUSTOMER_DELETED',
    tableName: 'customers',
    recordId: id,
    oldValues: removed,
  });
}
