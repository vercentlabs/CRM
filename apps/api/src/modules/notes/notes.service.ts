import type { Note } from '@crm/types';
import type { createNoteSchema, updateNoteSchema } from '@crm/validation';
import type { z } from 'zod';
import { recordAuditEvent } from '../../platform/audit.js';
import { pool } from '../../platform/db.js';
import { AppError } from '../../platform/http/errors.js';
import { ownerFilter, type Actor } from '../../platform/tenancy.js';
import * as notes from './notes.repository.js';

type Permission = 'crm.notes.read' | 'crm.notes.update' | 'crm.notes.delete';

const FORBIDDEN: Record<Permission, string> = {
  'crm.notes.read': 'You do not have permission to view this note',
  'crm.notes.update': 'You do not have permission to update this note',
  'crm.notes.delete': 'You do not have permission to delete this note',
};

async function loadScoped(actor: Actor, id: number, permission: Permission): Promise<Note> {
  const note = await notes.findLive(pool, actor, id);
  if (!note) throw AppError.notFound('Note not found');
  if (ownerFilter(actor, permission) !== null && note.created_by !== actor.userId) {
    throw AppError.forbidden(FORBIDDEN[permission]);
  }
  return note;
}

export async function listNotes(
  actor: Actor,
  filter: Omit<notes.NoteFilter, 'ownerId'>,
  orderBy: string,
  paging: { page: number; limit: number },
) {
  const { rows, total } = await notes.list(
    pool,
    actor,
    { ...filter, ownerId: ownerFilter(actor, 'crm.notes.read') },
    orderBy,
    { limit: paging.limit, offset: (paging.page - 1) * paging.limit },
  );
  return { items: rows, total };
}

export const getNote = (actor: Actor, id: number) => loadScoped(actor, id, 'crm.notes.read');

export async function createNote(
  actor: Actor,
  input: z.output<typeof createNoteSchema>,
): Promise<Note> {
  const id = await notes.insert(pool, actor, input, actor.userId);
  await recordAuditEvent({
    action: 'CREATE',
    tableName: 'notes',
    recordId: id,
    newValues: { title: input.title },
  });
  return (await notes.findLive(pool, actor, id))!;
}

export async function updateNote(
  actor: Actor,
  id: number,
  patch: z.output<typeof updateNoteSchema>,
): Promise<Note> {
  const current = await loadScoped(actor, id, 'crm.notes.update');
  await notes.update(pool, actor, id, {
    title: patch.title ?? current.title,
    content: patch.content ?? current.content,
    color: patch.color ?? current.color,
    tags: patch.tags ?? current.tags,
  });
  await recordAuditEvent({
    action: 'UPDATE',
    tableName: 'notes',
    recordId: id,
    oldValues: { title: current.title },
    newValues: { title: patch.title ?? current.title },
  });
  return (await notes.findLive(pool, actor, id))!;
}

/** Soft delete (is_deleted = true), as before. */
export async function deleteNote(actor: Actor, id: number): Promise<void> {
  const current = await loadScoped(actor, id, 'crm.notes.delete');
  await notes.softDelete(pool, actor, id);
  await recordAuditEvent({
    action: 'DELETE',
    tableName: 'notes',
    recordId: id,
    oldValues: { title: current.title },
  });
}
