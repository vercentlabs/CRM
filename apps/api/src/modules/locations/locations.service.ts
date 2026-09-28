import type { SalesLocation } from '@crm/types';
import type { checkInSchema, createLocationSchema, updateLocationSchema } from '@crm/validation';
import type { z } from 'zod';
import { recordAuditEvent } from '../../platform/audit.js';
import { pool } from '../../platform/db.js';
import { AppError } from '../../platform/http/errors.js';
import { assertMember, type Actor } from '../../platform/tenancy.js';
import * as locations from './locations.repository.js';

const NOT_FOUND = 'Sales location not found';

export const listLocations = (actor: Actor) => locations.list(pool, actor);

export async function getLocation(actor: Actor, id: number): Promise<SalesLocation> {
  const location = await locations.findById(pool, actor, id);
  if (!location) throw AppError.notFound(NOT_FOUND);
  return location;
}

export async function createLocation(
  actor: Actor,
  input: z.output<typeof createLocationSchema>,
): Promise<SalesLocation> {
  await assertMember(pool, actor, input.manager_id, 'Manager', 'manager_id');
  const id = await locations.insert(pool, actor, input);
  await recordAuditEvent({
    action: 'CREATE_SALES_LOCATION',
    tableName: 'sales_locations',
    recordId: id,
    newValues: { name: input.name, manager_id: input.manager_id ?? null },
  });
  return (await locations.findById(pool, actor, id))!;
}

export async function updateLocation(
  actor: Actor,
  id: number,
  patch: z.output<typeof updateLocationSchema>,
): Promise<SalesLocation> {
  const current = await getLocation(actor, id);
  await assertMember(pool, actor, patch.manager_id, 'Manager', 'manager_id');
  await locations.update(pool, actor, id, patch);
  const updated = (await locations.findById(pool, actor, id))!;
  await recordAuditEvent({
    action: 'UPDATE_SALES_LOCATION',
    tableName: 'sales_locations',
    recordId: id,
    oldValues: current,
    newValues: updated,
  });
  return updated;
}

/** Permanent delete; refused while leads still reference the location. */
export async function deleteLocation(actor: Actor, id: number): Promise<void> {
  const current = await getLocation(actor, id);
  if ((await locations.countReferencingLeads(pool, actor, id)) > 0) {
    throw AppError.badRequest(
      'Cannot delete sales location. It is referenced by one or more leads.',
    );
  }
  await locations.remove(pool, actor, id);
  await recordAuditEvent({
    action: 'DELETE_SALES_LOCATION',
    tableName: 'sales_locations',
    recordId: id,
    oldValues: current,
  });
}

/** The caller reports their own position (never someone else's). */
export const checkIn = (actor: Actor, input: z.output<typeof checkInSchema>) =>
  locations.upsertCheckIn(pool, actor, actor.userId, {
    latitude: input.latitude,
    longitude: input.longitude,
    address: input.address ?? null,
  });

export const listExecutiveLocations = (actor: Actor) => locations.executives(pool, actor);
