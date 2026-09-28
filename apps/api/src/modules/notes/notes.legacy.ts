import { createNoteSchema, updateNoteSchema } from '@crm/validation';
import { Router } from 'express';
import { legacyId, legacyRoute } from '../../platform/http/legacy.js';
import { parseId } from '../../platform/tenancy.js';
import { tagsQuery } from './notes.controller.js';
import * as service from './notes.service.js';

/** Historical `dateRange` query: JSON `{ start, end }`; malformed values are ignored. */
function parseDateRange(value: unknown): { from?: string; to?: string } {
  if (typeof value !== 'string' || value === 'null') return {};
  try {
    const { start, end } = JSON.parse(value) as { start?: string; end?: string };
    return {
      ...(start && !Number.isNaN(Date.parse(start)) ? { from: start } : {}),
      ...(end && !Number.isNaN(Date.parse(end)) ? { to: end } : {}),
    };
  } catch {
    return {};
  }
}

/** DEPRECATED `/notes/*` adapters → notes.service. */
export function legacyNotesRouter(): Router {
  const router = Router();

  router.get(
    '/',
    ...legacyRoute({
      permission: 'crm.notes.read',
      handle: async ({ actor, req, res }) => {
        const query = req.query as Record<string, unknown>;
        const page = Math.max(parseInt(String(query.page ?? '')) || 1, 1);
        const pageSize = Math.min(Math.max(parseInt(String(query.pageSize ?? '')) || 20, 1), 100);
        const { items, total } = await service.listNotes(
          actor,
          {
            search: typeof query.search === 'string' && query.search ? query.search : undefined,
            authorId: query.author ? (parseId(query.author) ?? 0) : undefined,
            tags: tagsQuery.parse(query.tags),
            ...parseDateRange(query.dateRange),
          },
          'n.updated_at DESC',
          { page, limit: pageSize },
        );
        res.status(200).json({
          message: 'Notes retrieved successfully',
          notes: items,
          page,
          pageSize,
          total,
          hasMore: (page - 1) * pageSize + items.length < total,
        });
      },
    }),
  );

  router.get(
    '/:id',
    ...legacyRoute({
      permission: 'crm.notes.read',
      handle: async ({ actor, req, res }) => {
        const note = await service.getNote(actor, legacyId(req.params.id, 'Note not found'));
        res.status(200).json({ message: 'Note retrieved successfully', note });
      },
    }),
  );

  router.post(
    '/',
    ...legacyRoute({
      permission: 'crm.notes.create',
      body: createNoteSchema,
      handle: async ({ actor, body, res }) => {
        const note = await service.createNote(actor, body);
        res.status(201).json({ message: 'Note created successfully', note });
      },
    }),
  );

  router.put(
    '/:id',
    ...legacyRoute({
      permission: 'crm.notes.update',
      body: updateNoteSchema,
      // Historical PUT ignored empty strings (`title || note.title`).
      mapBody: (body) =>
        Object.fromEntries(Object.entries(body).filter(([, value]) => value !== '')),
      handle: async ({ actor, body, req, res }) => {
        const note = await service.updateNote(
          actor,
          legacyId(req.params.id, 'Note not found'),
          body,
        );
        res.status(200).json({ message: 'Note updated successfully', note });
      },
    }),
  );

  router.delete(
    '/:id',
    ...legacyRoute({
      permission: 'crm.notes.delete',
      handle: async ({ actor, req, res }) => {
        await service.deleteNote(actor, legacyId(req.params.id, 'Note not found'));
        res.status(200).json({ message: 'Note deleted successfully' });
      },
    }),
  );

  return router;
}
