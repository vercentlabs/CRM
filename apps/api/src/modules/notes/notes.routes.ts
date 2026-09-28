import { z } from 'zod';
import type { ApiModule } from '../../platform/http/route.js';
import * as notes from './notes.controller.js';
import { noteSchema } from './notes.controller.js';

const tags = ['Notes'];

export const notesModule: ApiModule = {
  name: 'notes',
  routes: [
    {
      method: 'get',
      path: '/notes',
      summary: 'List notes (own scope: notes I created)',
      tags,
      permission: 'crm.notes.read',
      controller: notes.list,
      response: noteSchema.array(),
      paginated: true,
    },
    {
      method: 'post',
      path: '/notes',
      summary: 'Create a note',
      tags,
      permission: 'crm.notes.create',
      controller: notes.create,
      response: noteSchema,
      successStatus: 201,
    },
    {
      method: 'get',
      path: '/notes/:id',
      summary: 'Get a note',
      tags,
      permission: 'crm.notes.read',
      controller: notes.get,
      response: noteSchema,
    },
    {
      method: 'patch',
      path: '/notes/:id',
      summary: 'Update a note',
      tags,
      permission: 'crm.notes.update',
      controller: notes.update,
      response: noteSchema,
    },
    {
      method: 'delete',
      path: '/notes/:id',
      summary: 'Delete a note (soft delete)',
      tags,
      permission: 'crm.notes.delete',
      controller: notes.remove,
      response: z.object({ deleted: z.literal(true) }),
    },
  ],
};
