import type { Note } from '@crm/types';
import { createNoteSchema } from '@crm/validation';
import { useNavigation } from '@react-navigation/native';
import { useState } from 'react';
import { Controller } from 'react-hook-form';
import { StyleSheet, View } from 'react-native';
import { applyServerErrors, FormText, useZodForm } from '../../components/forms/form';
import { FormActions, FormError } from '../../components/forms/pickers';
import {
  Button,
  Chip,
  confirm,
  ErrorState,
  LoadingState,
  Screen,
  Section,
  Segmented,
  TextField,
  useToast,
} from '../../components/ui';
import { errorMessage } from '../../lib/errors';
import { NOTE_PRIORITIES } from '../../lib/labels';
import type { RootScreenProps } from '../../navigation/types';
import { useNote, useNoteAccess, useNoteMutations } from './hooks';

export function NoteFormScreen({ route }: RootScreenProps<'NoteForm'>) {
  const id = route.params?.id;
  const note = useNote(id ?? 0);
  if (id === undefined) return <NoteForm />;
  if (note.isPending)
    return (
      <Screen title="Note" back>
        <LoadingState />
      </Screen>
    );
  if (note.error) {
    return (
      <Screen title="Note" back>
        <ErrorState error={note.error} onRetry={() => void note.refetch()} />
      </Screen>
    );
  }
  return <NoteForm note={note.data} />;
}

function NoteForm({ note }: { note?: Note }) {
  const navigation = useNavigation();
  const access = useNoteAccess();
  const editable = !note || access.canEdit(note);
  const { create, update, remove } = useNoteMutations();
  const toast = useToast();
  const [formError, setFormError] = useState<string | null>(null);
  const [tagText, setTagText] = useState('');
  const form = useZodForm(createNoteSchema, {
    defaultValues: {
      title: note?.title ?? '',
      content: note?.content ?? '',
      color: note?.color ?? 'blue',
      tags: note?.tags ?? [],
    },
  });
  const { control, handleSubmit } = form;

  const submit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      if (note) await update.mutateAsync({ id: note.id, input: values });
      else await create.mutateAsync(values);
      toast.success(note ? 'Note updated' : 'Note created', values.title);
      navigation.goBack();
    } catch (error) {
      setFormError(applyServerErrors(form, error));
    }
  });

  const onDelete = () => {
    if (!note) return;
    confirm({
      title: 'Delete note?',
      message: `"${note.title}" will be removed.`,
      confirmLabel: 'Delete',
      onConfirm: async () => {
        try {
          await remove.mutateAsync(note.id);
          toast.success('Note deleted', note.title);
          navigation.goBack();
        } catch (error) {
          toast.error('Could not delete note', errorMessage(error));
        }
      },
    });
  };

  return (
    <Screen
      title={note ? (editable ? 'Edit note' : 'Note') : 'New note'}
      subtitle={note?.author_name ?? undefined}
      back
      scroll
      keyboard
    >
      <FormError message={formError} />
      <Section title="Note">
        <FormText control={control} name="title" label="Title" required editable={editable} />
        <FormText
          control={control}
          name="content"
          label="Content"
          required
          multiline
          editable={editable}
          style={{ minHeight: 140 }}
        />
        <Controller
          control={control}
          name="color"
          render={({ field }) => (
            <Segmented
              label="Priority"
              value={String(field.value ?? 'blue')}
              onChange={(v) => editable && field.onChange(v)}
              options={NOTE_PRIORITIES.map((p) => ({ value: p.value, label: p.label }))}
            />
          )}
        />
        <Controller
          control={control}
          name="tags"
          render={({ field, fieldState }) => {
            const tags = (field.value ?? []) as string[];
            const add = () => {
              const next = tagText.trim().replace(/^#/, '');
              if (next && !tags.includes(next)) field.onChange([...tags, next]);
              setTagText('');
            };
            return (
              <View style={styles.tags}>
                {editable ? (
                  <TextField
                    label="Tags"
                    placeholder="Add a tag and press enter"
                    value={tagText}
                    onChangeText={setTagText}
                    onSubmitEditing={add}
                    returnKeyType="done"
                    autoCapitalize="none"
                    error={fieldState.error?.message}
                  />
                ) : null}
                <View style={styles.chips}>
                  {tags.map((t) => (
                    <Chip
                      key={t}
                      label={`#${t}${editable ? '  ×' : ''}`}
                      selected
                      onPress={() => editable && field.onChange(tags.filter((x) => x !== t))}
                    />
                  ))}
                </View>
              </View>
            );
          }}
        />
      </Section>
      {editable ? (
        <FormActions
          submitLabel={note ? 'Save changes' : 'Create note'}
          saving={create.isPending || update.isPending}
          onSubmit={() => void submit()}
          onCancel={() => navigation.goBack()}
        />
      ) : null}
      {note && access.canDelete(note) ? (
        <Button
          label="Delete note"
          variant="danger"
          icon="trash-2"
          onPress={onDelete}
          loading={remove.isPending}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  tags: { gap: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
});
