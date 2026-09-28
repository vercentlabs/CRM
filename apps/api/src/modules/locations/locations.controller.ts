import { checkInSchema, createLocationSchema, updateLocationSchema } from '@crm/validation';
import { z } from 'zod';
import { idParams } from '../../platform/http/query.js';
import { controller, created, ok } from '../../platform/http/route.js';
import { actorFrom } from '../../platform/tenancy.js';
import * as service from './locations.service.js';

export const locationSchema = z.object({
  id: z.number(),
  name: z.string(),
  address: z.string().nullable(),
  city: z.string().nullable(),
  state: z.string().nullable(),
  country: z.string().nullable(),
  pin_code: z.string().nullable(),
  contact_phone: z.string().nullable(),
  manager_id: z.number().nullable(),
  manager_name: z.string().nullable(),
  created_at: z.string(),
});

export const executiveLocationSchema = z.object({
  id: z.number(),
  full_name: z.string(),
  latitude: z.string().nullable(),
  longitude: z.string().nullable(),
  address: z.string().nullable(),
  updated_at: z.string().nullable(),
});

export const checkInResultSchema = z.object({
  id: z.number(),
  user_id: z.number(),
  latitude: z.string(),
  longitude: z.string(),
  address: z.string().nullable(),
  updated_at: z.string(),
});

export const list = controller({
  handle: async ({ auth }) => ok(await service.listLocations(actorFrom(auth))),
});

export const get = controller({
  params: idParams,
  handle: async ({ auth, params }) => ok(await service.getLocation(actorFrom(auth), params.id)),
});

export const create = controller({
  body: createLocationSchema,
  handle: async ({ auth, body }) => created(await service.createLocation(actorFrom(auth), body)),
});

export const update = controller({
  params: idParams,
  body: updateLocationSchema,
  handle: async ({ auth, params, body }) =>
    ok(await service.updateLocation(actorFrom(auth), params.id, body)),
});

export const remove = controller({
  params: idParams,
  handle: async ({ auth, params }) => {
    await service.deleteLocation(actorFrom(auth), params.id);
    return ok({ deleted: true });
  },
});

export const checkIn = controller({
  body: checkInSchema,
  handle: async ({ auth, body }) => ok(await service.checkIn(actorFrom(auth), body)),
});

export const executives = controller({
  handle: async ({ auth }) => ok(await service.listExecutiveLocations(actorFrom(auth))),
});
