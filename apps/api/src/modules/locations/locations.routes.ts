import { checkInSchema, createLocationSchema, updateLocationSchema } from '@crm/validation';
import { Router } from 'express';
import { z } from 'zod';
import { legacyId, legacyRoute } from '../../platform/http/legacy.js';
import type { ApiModule } from '../../platform/http/route.js';
import * as locations from './locations.controller.js';
import {
  checkInResultSchema,
  executiveLocationSchema,
  locationSchema,
} from './locations.controller.js';
import * as service from './locations.service.js';

const tags = ['Locations'];

export const locationsModule: ApiModule = {
  name: 'locations',
  routes: [
    {
      method: 'get',
      path: '/locations',
      summary: 'List sales locations',
      tags,
      permission: 'crm.locations.read',
      controller: locations.list,
      response: locationSchema.array(),
    },
    {
      method: 'post',
      path: '/locations',
      summary: 'Create a sales location',
      tags,
      permission: 'crm.locations.manage',
      controller: locations.create,
      response: locationSchema,
      successStatus: 201,
    },
    {
      method: 'get',
      path: '/locations/executives',
      summary: 'Latest check-in of each field member',
      tags,
      permission: 'crm.locations.read',
      controller: locations.executives,
      response: executiveLocationSchema.array(),
    },
    {
      method: 'put',
      path: '/locations/me',
      summary: 'Report my current location (check-in)',
      tags,
      permission: 'crm.locations.checkin',
      controller: locations.checkIn,
      response: checkInResultSchema,
    },
    {
      method: 'get',
      path: '/locations/:id',
      summary: 'Get a sales location',
      tags,
      permission: 'crm.locations.read',
      controller: locations.get,
      response: locationSchema,
    },
    {
      method: 'patch',
      path: '/locations/:id',
      summary: 'Update a sales location',
      tags,
      permission: 'crm.locations.manage',
      controller: locations.update,
      response: locationSchema,
    },
    {
      method: 'delete',
      path: '/locations/:id',
      summary: 'Delete a sales location (refused while referenced by leads)',
      tags,
      permission: 'crm.locations.manage',
      controller: locations.remove,
      response: z.object({ deleted: z.literal(true) }),
    },
  ],
};

/** DEPRECATED `/sales-locations/*` adapters → locations.service. */
export function legacyLocationsRouter(): Router {
  const router = Router();

  router.get(
    '/',
    ...legacyRoute({
      permission: 'crm.locations.read',
      handle: async ({ actor, res }) => {
        // Historical rows exposed the manager's name as `full_name`.
        const rows = (await service.listLocations(actor)).map(({ manager_name, ...rest }) => ({
          ...rest,
          full_name: manager_name,
        }));
        res.status(200).json({ success: true, count: rows.length, locations: rows });
      },
    }),
  );

  router.post(
    '/',
    ...legacyRoute({
      permission: 'crm.locations.manage',
      body: createLocationSchema,
      handle: async ({ actor, body, res }) => {
        const location = await service.createLocation(actor, body);
        res
          .status(201)
          .json({ success: true, message: 'Sales location created successfully', location });
      },
    }),
  );

  router.put(
    '/:id',
    ...legacyRoute({
      permission: 'crm.locations.manage',
      body: updateLocationSchema,
      handle: async ({ actor, body, req, res }) => {
        const location = await service.updateLocation(
          actor,
          legacyId(req.params.id, 'Sales location not found'),
          body,
        );
        res
          .status(200)
          .json({ success: true, message: 'Sales location updated successfully', location });
      },
    }),
  );

  router.delete(
    '/:id',
    ...legacyRoute({
      permission: 'crm.locations.manage',
      handle: async ({ actor, req, res }) => {
        await service.deleteLocation(actor, legacyId(req.params.id, 'Sales location not found'));
        res.status(200).json({ success: true, message: 'Sales location deleted successfully' });
      },
    }),
  );

  router.post(
    '/update-location',
    ...legacyRoute({
      permission: 'crm.locations.checkin',
      body: checkInSchema,
      handle: async ({ actor, body, res }) => {
        const location = await service.checkIn(actor, body);
        res.status(200).json({ success: true, message: 'Location updated successfully', location });
      },
    }),
  );

  router.get(
    '/executives',
    ...legacyRoute({
      permission: 'crm.locations.read',
      handle: async ({ actor, res }) => {
        const executives = await service.listExecutiveLocations(actor);
        res.status(200).json({ success: true, count: executives.length, executives });
      },
    }),
  );

  return router;
}
