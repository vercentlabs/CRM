'use client';

import type { NoteListQuery } from '@crm/api-client';
import type { Note } from '@crm/types';
import {
  Badge,
  Button,
  ConfirmDialog,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Pagination,
  PlusIcon,
  Select,
  Skeleton,
  Textarea,
  useToast,
  type BadgeTone,
} from '@crm/ui';
import { createNoteSchema } from '@crm/validation';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { PermissionGate } from '@/components/auth/PermissionGate';
import { ApiErrorState } from '@/components/feedback/QueryState';
import { applyServerErrors, useZodForm } from '@/components/forms/form';
import { FormSheet } from '@/components/forms/FormSheet';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useListParams } from '@/hooks/useListParams';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { formatRelative } from '@/lib/format';
import { useQueryKey, useSession } from '@/providers/SessionProvider';

/** Notes store their priority in `color` (historical format kept for existing data). */
const PRIORITIES: Array<{ value: string; label: string; tone: BadgeTone }> = [
  { value: 'blue', label: 'Normal', tone: 'primary' },
  { value: 'green', label: 'Low', tone: 'success' },
  { value: 'yellow', label: 'Medium', tone: 'warning' },
  { value: 'red', label: 'High', tone: 'danger' },
];
const priorityOf = (color: string) => PRIORITIES.find((p) => p.value === color) ?? PRIORITIES[0]!;

const SORTS = [
  { value: '-updated_at', label: 'Recently updated' },
  { value: '-created_at', label: 'Newest' },
  { value: 'title', label: 'Title A–Z' },
];

function useNotes(query: NoteListQuery) {
  const key = useQueryKey();
  return useQuery({
    queryKey: key('notes', 'list', { ...query }),
    queryFn: () => api().v1.notes.list(query),
    placeholderData: keepPreviousData,
  });
}

function useNoteMutations() {
  const key = useQueryKey();
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: key('notes') });
  return {
    create: useMutation({ mutationFn: api().v1.notes.create, onSuccess: invalidate }),
    update: useMutation({
      mutationFn: ({
        id,
        input,
      }: {
        id: number;
        input: Parameters<ReturnType<typeof api>['v1']['notes']['update']>[1];
      }) => api().v1.notes.update(id, input),
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: (id: number) => api().v1.notes.remove(id),
      onSuccess: invalidate,
    }),
  };
}

export function NotesScreen() {
  const session = useSession();
  const toast = useToast();
  const { params, page, setParams } = useListParams(['search', 'tag'] as const, {
    sort: '-updated_at',
  });
  const [searchText, setSearchText] = useState(params.search);
  const debounced = useDebouncedValue(searchText, 350);
  useEffect(() => {
    if (debounced !== params.search) setParams({ search: debounced });
  }, [debounced, params.search, setParams]);

  const notes = useNotes({
    page,
    limit: 24,
    sort: params.sort,
    ...(params.search ? { search: params.search } : {}),
    ...(params.tag ? { tags: [params.tag] } : {}),
  });
  const { remove } = useNoteMutations();
  const [editing, setEditing] = useState<Note | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<Note | null>(null);

  const mine = (n: Note) => n.created_by === session.user?.id;
  const canEdit = (n: Note) =>
    session.canOrg('crm.notes.update') || (session.can('crm.notes.update') && mine(n));
  const canDelete = (n: Note) =>
    session.canOrg('crm.notes.delete') || (session.can('crm.notes.delete') && mine(n));

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await remove.mutateAsync(deleting.id);
      toast.success('Note deleted', deleting.title);
      setDeleting(null);
    } catch (error) {
      toast.error('Could not delete note', errorMessage(error));
    }
  };

  return (
    <>
      <PageHeader
        title="Notes"
        description={notes.data ? `${notes.data.pagination.total} notes` : undefined}
        actions={
          <PermissionGate permission="crm.notes.create">
            <Button variant="primary" icon={<PlusIcon />} onClick={() => setCreating(true)}>
              New note
            </Button>
          </PermissionGate>
        }
      />
      <div className="mb-3 flex flex-wrap gap-2">
        <Input
          type="search"
          aria-label="Search notes"
          placeholder="Search title or content"
          className="w-full sm:w-72"
          value={searchText}
          onChange={(event) => setSearchText(event.target.value)}
        />
        <Select
          aria-label="Sort notes"
          className="w-48"
          options={SORTS}
          value={params.sort}
          onChange={(event) => setParams({ sort: event.target.value })}
        />
        {params.tag && (
          <Button variant="ghost" onClick={() => setParams({ tag: null })}>
            Tag: {params.tag} ✕<span className="sr-only"> (remove tag filter)</span>
          </Button>
        )}
      </div>

      {notes.error ? (
        <ApiErrorState error={notes.error} onRetry={() => void notes.refetch()} />
      ) : notes.isPending ? (
        <div
          className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
          role="status"
          aria-label="Loading notes"
        >
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-36" />
          ))}
        </div>
      ) : notes.data.items.length === 0 ? (
        <EmptyState
          title={params.search || params.tag ? 'No notes match' : 'No notes yet'}
          action={
            session.can('crm.notes.create') && !params.search && !params.tag ? (
              <Button variant="primary" icon={<PlusIcon />} onClick={() => setCreating(true)}>
                New note
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {notes.data.items.map((note) => {
              const priority = priorityOf(note.color);
              return (
                <li
                  key={note.id}
                  className="flex flex-col rounded-lg border border-border bg-surface p-4"
                >
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="font-medium break-words">{note.title}</h2>
                    <Badge tone={priority.tone}>{priority.label}</Badge>
                  </div>
                  {/* Plain text: note content is never rendered as HTML. */}
                  <p className="mt-2 line-clamp-5 flex-1 text-sm whitespace-pre-wrap text-muted">
                    {note.content}
                  </p>
                  {note.tags.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1">
                      {note.tags.map((tag) => (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => setParams({ tag })}
                          className="rounded bg-surface-muted px-1.5 py-0.5 text-xs hover:text-primary"
                          aria-label={`Filter by tag ${tag}`}
                        >
                          #{tag}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="mt-3 flex items-center justify-between border-t border-border pt-2 text-xs text-muted">
                    <span>
                      {note.author_name ?? 'Unknown'} · {formatRelative(note.updated_at)}
                    </span>
                    <span className="flex gap-1">
                      {canEdit(note) && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setEditing(note)}
                          aria-label={`Edit ${note.title}`}
                        >
                          Edit
                        </Button>
                      )}
                      {canDelete(note) && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-danger"
                          onClick={() => setDeleting(note)}
                          aria-label={`Delete ${note.title}`}
                        >
                          Delete
                        </Button>
                      )}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
          <Pagination
            page={notes.data.pagination.page}
            totalPages={notes.data.pagination.totalPages}
            total={notes.data.pagination.total}
            limit={notes.data.pagination.limit}
            onPageChange={(next) => setParams({ page: next })}
          />
        </>
      )}

      <NoteFormSheet
        open={creating || editing !== null}
        note={editing}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
      />
      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={() => void confirmDelete()}
        loading={remove.isPending}
        title="Delete note?"
        confirmLabel="Delete note"
        description={`“${deleting?.title ?? ''}” will be removed from your notes.`}
      />
    </>
  );
}

interface NoteFormSheetProps {
  open: boolean;
  note: Note | null;
  onClose: () => void;
}

function NoteFormSheet(props: NoteFormSheetProps) {
  return props.open ? <NoteForm key={props.note?.id ?? 'new'} {...props} /> : null;
}

function NoteForm({ open, note, onClose }: NoteFormSheetProps) {
  const { create, update } = useNoteMutations();
  const toast = useToast();
  const [formError, setFormError] = useState<string | null>(null);
  const [tagText, setTagText] = useState((note?.tags ?? []).join(', '));
  const form = useZodForm(createNoteSchema, {
    defaultValues: {
      title: note?.title ?? '',
      content: note?.content ?? '',
      color: note?.color ?? 'blue',
      tags: note?.tags ?? [],
    },
  });
  const { register, handleSubmit, formState, setValue } = form;

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      if (note) await update.mutateAsync({ id: note.id, input: values });
      else await create.mutateAsync(values);
      toast.success(note ? 'Note updated' : 'Note created', values.title);
      onClose();
    } catch (error) {
      setFormError(applyServerErrors(form, error));
    }
  });

  return (
    <FormSheet
      open={open}
      onClose={onClose}
      title={note ? 'Edit note' : 'New note'}
      submitLabel={note ? 'Save changes' : 'Create note'}
      saving={create.isPending || update.isPending}
      error={formError}
      onSubmit={onSubmit}
    >
      <Field label="Title" required error={formState.errors.title?.message}>
        <Input {...register('title')} />
      </Field>
      <Field label="Content" required error={formState.errors.content?.message}>
        <Textarea rows={10} {...register('content')} />
      </Field>
      <Field label="Priority" error={formState.errors.color?.message}>
        <Select options={PRIORITIES} {...register('color')} />
      </Field>
      <Field label="Tags" hint="Separate tags with commas" error={formState.errors.tags?.message}>
        <Input
          value={tagText}
          onChange={(event) => {
            setTagText(event.target.value);
            setValue(
              'tags',
              event.target.value
                .split(',')
                .map((tag) => tag.trim())
                .filter(Boolean),
              { shouldValidate: true },
            );
          }}
        />
      </Field>
    </FormSheet>
  );
}
