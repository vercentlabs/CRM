import type { Note } from '@crm/types';
import { useNavigation } from '@react-navigation/native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { ListRow, PagedList, usePagedQuery } from '../../components/lists/PagedList';
import { Badge, Button, EmptyState, IconButton, Screen, TextField } from '../../components/ui';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { api } from '../../lib/api';
import { formatRelative } from '../../lib/format';
import { notePriority } from '../../lib/labels';
import { useSession } from '../../providers/SessionProvider';

/** Notes are plain text (never rendered as HTML); deletion is a soft delete on the server. */
export function NotesScreen() {
  const navigation = useNavigation();
  const { can } = useSession();
  const [search, setSearch] = useState('');
  const debounced = useDebouncedValue(search.trim(), 350);
  const list = usePagedQuery<Note>(['notes', 'list', { search: debounced }], (page) =>
    api().v1.notes.list({
      page,
      limit: 20,
      sort: '-updated_at',
      ...(debounced ? { search: debounced } : {}),
    }),
  );
  const canCreate = can('crm.notes.create');
  return (
    <Screen
      title="Notes"
      subtitle={list.total !== undefined ? `${list.total} notes` : undefined}
      actions={
        canCreate ? (
          <IconButton
            icon="plus"
            label="New note"
            onPress={() => navigation.navigate('NoteForm', {})}
          />
        ) : null
      }
    >
      <PagedList
        query={list}
        keyExtractor={(n) => n.id}
        header={
          <View style={styles.filters}>
            <TextField
              label="Search notes"
              placeholder="Title, content or tag"
              value={search}
              onChangeText={setSearch}
              returnKeyType="search"
            />
          </View>
        }
        empty={
          <EmptyState
            icon="file-text"
            title={debounced ? 'No notes match' : 'No notes yet'}
            action={
              !debounced && canCreate ? (
                <Button
                  label="New note"
                  variant="primary"
                  icon="plus"
                  onPress={() => navigation.navigate('NoteForm', {})}
                />
              ) : undefined
            }
          />
        }
        renderItem={(n) => {
          const priority = notePriority(n.color);
          return (
            <ListRow
              title={n.title}
              subtitle={n.content.replace(/\s+/g, ' ').slice(0, 120)}
              meta={[
                n.author_name,
                `updated ${formatRelative(n.updated_at)}`,
                n.tags.length ? n.tags.map((t) => `#${t}`).join(' ') : null,
              ]
                .filter(Boolean)
                .join(' · ')}
              onPress={() => navigation.navigate('NoteForm', { id: n.id })}
              trailing={<Badge label={priority.label} tone={priority.tone} />}
            />
          );
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({ filters: { padding: 16, paddingBottom: 8 } });
