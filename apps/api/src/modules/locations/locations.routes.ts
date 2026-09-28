import { z } from 'zod';
import type { ApiModule } from '../../platform/http/route.js';
import * as locations from './locations.controller.js';
import {
  checkInResultSchema,
  executiveLocationSchema,
  locationSchema,
} from './locations.controller.js';

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
