import { createNoteSchema, updateNoteSchema } from '@crm/validation';
import { z } from 'zod';
import {
  idParams,
  optionalDate,
  optionalId,
  pageQuery,
  sortQuery,
} from '../../platform/http/query.js';
import { controller, created, ok, paginationMeta } from '../../platform/http/route.js';
import { actorFrom } from '../../platform/tenancy.js';
import { NOTE_SORTS } from './notes.repository.js';
import * as service from './notes.service.js';

export const noteSchema = z.object({
  id: z.number(),
  title: z.string(),
  content: z.string(),
  color: z.string(),
  tags: z.array(z.string()),
  created_by: z.number(),
  created_at: z.string(),
  updated_at: z.string(),
  author_name: z.string().nullable(),
  author_email: z.string().nullable(),
});

/** `tags` accepts `tags=a&tags=b` or `tags=a,b`. */
export const tagsQuery = z
  .union([z.string(), z.array(z.string())])
  .optional()
  .transform((value) =>
    value === undefined
      ? undefined
      : (Array.isArray(value) ? value : value.split(','))
          .map((tag) => tag.trim())
          .filter(Boolean)
          .slice(0, 30),
  );

const listQuery = z.object({
  ...pageQuery,
  search: z.string().trim().min(1).max(100).optional(),
  author_id: optionalId,
  tags: tagsQuery,
  created_from: optionalDate,
  created_to: optionalDate,
  sort: sortQuery(NOTE_SORTS, '-updated_at'),
});

export const list = controller({
  query: listQuery,
  handle: async ({ auth, query }) => {
    const { items, total } = await service.listNotes(
      actorFrom(auth),
      {
        search: query.search,
        authorId: query.author_id,
        tags: query.tags,
        from: query.created_from,
        to: query.created_to,
      },
      query.sort,
      query,
    );
    return ok(items, paginationMeta(query.page, query.limit, total));
  },
});

export const get = controller({
  params: idParams,
  handle: async ({ auth, params }) => ok(await service.getNote(actorFrom(auth), params.id)),
});

export const create = controller({
  body: createNoteSchema,
  handle: async ({ auth, body }) => created(await service.createNote(actorFrom(auth), body)),
});

export const update = controller({
  params: idParams,
  body: updateNoteSchema,
  handle: async ({ auth, params, body }) =>
    ok(await service.updateNote(actorFrom(auth), params.id, body)),
});

export const remove = controller({
  params: idParams,
  handle: async ({ auth, params }) => {
    await service.deleteNote(actorFrom(auth), params.id);
    return ok({ deleted: true });
  },
});
