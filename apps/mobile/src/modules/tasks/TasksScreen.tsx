import type { Task, TaskStatus } from '@crm/types';
import { useNavigation } from '@react-navigation/native';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { ListRow, PagedList, usePagedQuery } from '../../components/lists/PagedList';
import { Badge, Button, Chip, EmptyState, IconButton, Screen, useToast } from '../../components/ui';
import { api } from '../../lib/api';
import { errorMessage } from '../../lib/errors';
import { formatDateTime, isPast } from '../../lib/format';
import {
  TASK_PRIORITY_LABEL,
  TASK_PRIORITY_TONE,
  TASK_STATUS_LABEL,
  TASK_STATUS_OPTIONS,
  TASK_STATUS_TONE,
} from '../../lib/labels';
import { useSession } from '../../providers/SessionProvider';
import { useTaskAccess, useTaskMutations } from './hooks';

const OPEN: TaskStatus[] = ['pending', 'in_progress'];

export function TasksScreen() {
  const navigation = useNavigation();
  const { can } = useSession();
  const access = useTaskAccess();
  const { update } = useTaskMutations();
  const toast = useToast();
  const [status, setStatus] = useState<TaskStatus | null>('pending');
  const list = usePagedQuery<Task>(['tasks', 'list', { status }], (page) =>
    api().v1.tasks.list({ page, limit: 20, sort: 'due_date', ...(status ? { status } : {}) }),
  );

  const complete = async (task: Task) => {
    try {
      await update.mutateAsync({ id: task.id, input: { status: 'completed' } });
      toast.success('Task completed', task.title);
    } catch (error) {
      toast.error('Could not complete task', errorMessage(error));
    }
  };

  const canCreate = can('crm.tasks.create');
  return (
    <Screen
      title="Tasks"
      subtitle={list.total !== undefined ? `${list.total} tasks` : undefined}
      actions={
        canCreate ? (
          <IconButton
            icon="plus"
            label="New task"
            onPress={() => navigation.navigate('TaskForm', {})}
          />
        ) : null
      }
    >
      <PagedList
        query={list}
        keyExtractor={(t) => t.id}
        header={
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chips}
          >
            <Chip label="All" selected={!status} onPress={() => setStatus(null)} />
            {TASK_STATUS_OPTIONS.map((o) => (
              <Chip
                key={o.value}
                label={o.label}
                selected={status === o.value}
                onPress={() => setStatus(o.value)}
              />
            ))}
          </ScrollView>
        }
        empty={
          <EmptyState
            icon="check-square"
            title={status ? `No ${TASK_STATUS_LABEL[status].toLowerCase()} tasks` : 'No tasks yet'}
            action={
              canCreate ? (
                <Button
                  label="New task"
                  variant="primary"
                  icon="plus"
                  onPress={() => navigation.navigate('TaskForm', {})}
                />
              ) : undefined
            }
          />
        }
        renderItem={(task) => {
          const overdue = OPEN.includes(task.status) && isPast(task.due_date);
          return (
            <ListRow
              title={task.title}
              subtitle={[
                task.assigned_to_name ?? 'Unassigned',
                `Due ${formatDateTime(task.due_date)}`,
              ].join(' · ')}
              onPress={() => navigation.navigate('TaskForm', { id: task.id })}
              trailing={
                <View style={styles.trailing}>
                  <Badge
                    label={overdue ? 'Overdue' : TASK_STATUS_LABEL[task.status]}
                    tone={overdue ? 'danger' : TASK_STATUS_TONE[task.status]}
                  />
                  <Badge
                    label={TASK_PRIORITY_LABEL[task.priority]}
                    tone={TASK_PRIORITY_TONE[task.priority]}
                  />
                  {OPEN.includes(task.status) && access.canEdit(task) ? (
                    <IconButton
                      icon="check"
                      label={`Complete ${task.title}`}
                      onPress={() => void complete(task)}
                      disabled={update.isPending}
                    />
                  ) : null}
                </View>
              }
            />
          );
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  chips: { gap: 8, padding: 16, paddingBottom: 8 },
  trailing: { alignItems: 'flex-end', gap: 4 },
});
