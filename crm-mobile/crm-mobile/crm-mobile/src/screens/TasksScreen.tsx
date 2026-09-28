import React, {useCallback, useEffect, useState, useMemo} from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import AppTopbar from '../components/AppTopbar';
import { apiRequest, type ApiError } from '../services/api';
import { Button, EmptyState, ErrorState, LoadingState } from '../components/ui';
import { useTheme } from '../theme/ThemeProvider';
import type { ThemeColors } from '../theme/colors';
import { useAuth } from '../context/AuthContext';
import type { TasksStackParamList } from '../navigation/TasksStack';

type Task = {
  id: number;
  title: string;
  description?: string | null;
  due_date: string;
  priority: 'low' | 'medium' | 'high';
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  assigned_to?: number | null;
  assigned_to_name?: string | null;
};

const priorityStyles: Record<string, { bg: string; text: string }> = {
  high: { bg: 'rgba(248, 113, 113, 0.2)', text: '#f87171' },
  medium: { bg: 'rgba(245, 158, 11, 0.2)', text: '#f59e0b' },
  low: { bg: 'rgba(34, 197, 94, 0.2)', text: '#22c55e' }
};

const statusStyles: Record<string, { bg: string; text: string }> = {
  completed: { bg: 'rgba(34, 197, 94, 0.2)', text: '#22c55e' },
  in_progress: { bg: 'rgba(59, 130, 246, 0.2)', text: '#60a5fa' },
  cancelled: { bg: 'rgba(148, 163, 184, 0.2)', text: '#cbd5f5' },
  pending: { bg: 'rgba(245, 158, 11, 0.2)', text: '#f59e0b' }
};

const TasksScreen = () => {
  const navigation = useNavigation<NativeStackNavigationProp<TasksStackParamList>>();
  const { theme } = useTheme();
  const { colors } = theme;
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { user, isManagerOrHigher, isSales } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const loadTasks = useCallback(async (isRefresh = false) => {
    setError(null);
    if (!isRefresh) {
      setLoading(true);
    }
    try {
      const data = await apiRequest<{ tasks?: Task[] }>('/tasks');
      setTasks(data.tasks || []);
    } catch (err) {
      const apiError = err as ApiError;
      setError(apiError.message || 'Failed to load tasks.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadTasks();
  }, [loadTasks]);

  useFocusEffect(
    useCallback(() => {
      void loadTasks();
    }, [loadTasks])
  );

  const handleRefresh = () => {
    setRefreshing(true);
    void loadTasks(true);
  };

  const canEditOrDelete = (task: Task) => {
    if (isManagerOrHigher()) return true;
    return isSales() && task.assigned_to === user?.id;
  };

  const handleDelete = async (taskId: number) => {
    setDeletingId(taskId);
    try {
      await apiRequest(`/tasks/${taskId}`, { method: 'DELETE' });
      await loadTasks(true);
    } catch (err) {
      const apiError = err as ApiError;
      setError(apiError.message || 'Failed to delete task.');
    } finally {
      setDeletingId(null);
    }
  };

  const formatDate = (value: string) => {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const formatTime = (value: string) => {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '';
    return parsed.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <LinearGradient
      colors={colors.screenGradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.container}
    >
      <SafeAreaView style={styles.safeArea}>
        <AppTopbar placeholder="Search tasks..." />

        <ScrollView contentContainerStyle={styles.scrollContent}>
          <LinearGradient colors={['#4f46e5', '#8b5cf6']} style={styles.heroCard}>
            <View style={styles.heroRow}>
              <View style={styles.heroText}>
                <Text style={styles.heroTitle}>Tasks</Text>
                <Text style={styles.heroSubtitle}>Track and manage assignments</Text>
                <View style={styles.heroChip}>
                  <Feather name="check-circle" size={12} color="#ffffff" />
                  <Text style={styles.heroChipText}>{tasks.length} Total Tasks</Text>
                </View>
              </View>
              <View style={styles.heroActions}>
                <Pressable style={styles.heroButton} onPress={handleRefresh} disabled={refreshing}>
                  <Feather name="refresh-cw" size={12} color="#ffffff" />
                  <Text style={styles.heroButtonText}>
                    {refreshing ? 'Refreshing' : 'Refresh'}
                  </Text>
                </Pressable>
                <Pressable
                  style={styles.heroPrimaryButton}
                  onPress={() => navigation.navigate('TaskForm', { mode: 'create' })}
                >
                  <Feather name="plus" size={12} color="#4f46e5" />
                  <Text style={styles.heroPrimaryText}>Add Task</Text>
                </Pressable>
              </View>
            </View>
          </LinearGradient>

          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Task List</Text>
            {loading ? (
              <LoadingState label="Loading tasks..." />
            ) : error ? (
              <ErrorState title="Unable to load tasks" message={error} onAction={handleRefresh} />
            ) : tasks.length === 0 ? (
              <EmptyState
                title="No tasks found"
                message="Create a task to get started."
                actionLabel="Add Task"
                onAction={() => navigation.navigate('TaskForm', { mode: 'create' })}
              />
            ) : (
              tasks.map((task) => {
                const priorityStyle = priorityStyles[task.priority] || priorityStyles.medium;
                const statusStyle = statusStyles[task.status] || statusStyles.pending;
                return (
                  <View key={task.id} style={styles.taskCard}>
                    <View style={styles.taskHeader}>
                      <View style={styles.taskTitleWrap}>
                        <Text style={styles.taskTitle}>{task.title}</Text>
                        {task.description ? (
                          <Text style={styles.taskDescription}>{task.description}</Text>
                        ) : null}
                      </View>
                      <View style={styles.taskBadges}>
                        <View style={[styles.badge, { backgroundColor: priorityStyle.bg }]}>
                          <Text style={[styles.badgeText, { color: priorityStyle.text }]}>
                            {task.priority}
                          </Text>
                        </View>
                        <View style={[styles.badge, { backgroundColor: statusStyle.bg }]}>
                          <Text style={[styles.badgeText, { color: statusStyle.text }]}>
                            {task.status.replace('_', ' ')}
                          </Text>
                        </View>
                      </View>
                    </View>

                    <View style={styles.taskMetaRow}>
                      <View>
                        <Text style={styles.taskMetaLabel}>Due Date</Text>
                        <Text style={styles.taskMetaValue}>
                          {formatDate(task.due_date)} {formatTime(task.due_date)}
                        </Text>
                      </View>
                      <View>
                        <Text style={styles.taskMetaLabel}>Assigned To</Text>
                        <Text style={styles.taskMetaValue}>
                          {task.assigned_to_name || 'Unassigned'}
                        </Text>
                      </View>
                    </View>

                    {canEditOrDelete(task) ? (
                      <View style={styles.actionRow}>
                        <Button
                          label="Edit"
                          variant="secondary"
                          size="sm"
                          onPress={() =>
                            navigation.navigate('TaskForm', { mode: 'edit', taskId: task.id })
                          }
                          style={styles.actionButton}
                        />
                        {isManagerOrHigher() ? (
                          <Button
                            label={deletingId === task.id ? 'Deleting...' : 'Delete'}
                            variant="danger"
                            size="sm"
                            onPress={() => handleDelete(task.id)}
                            loading={deletingId === task.id}
                            disabled={deletingId === task.id}
                            style={styles.actionButton}
                          />
                        ) : null}
                      </View>
                    ) : null}
                  </View>
                );
              })
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
};

export default TasksScreen;

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1
  },
  safeArea: {
    flex: 1
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 24
  },
  heroCard: {
    borderRadius: 18,
    padding: 16,
    marginTop: 8,
    marginBottom: 16
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12
  },
  heroText: {
    flex: 1
  },
  heroTitle: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '700'
  },
  heroSubtitle: {
    color: '#e0e7ff',
    fontSize: 12,
    marginTop: 4
  },
  heroChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginTop: 8,
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.2)'
  },
  heroChipText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '600'
  },
  heroActions: {
    gap: 6
  },
  heroButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    backgroundColor: 'rgba(255, 255, 255, 0.1)'
  },
  heroButtonText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '600'
  },
  heroPrimaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: '#ffffff'
  },
  heroPrimaryText: {
    color: '#4f46e5',
    fontSize: 10,
    fontWeight: '700'
  },
  sectionCard: {
    backgroundColor: colors.card,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border
  },
  sectionTitle: {
    color: colors.foreground,
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 12
  },
  taskCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    marginBottom: 12,
    backgroundColor: colors.inputBg
  },
  taskHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
    gap: 10
  },
  taskTitleWrap: {
    flex: 1
  },
  taskTitle: {
    color: colors.foreground,
    fontSize: 14,
    fontWeight: '700'
  },
  taskDescription: {
    color: colors.mutedForeground,
    fontSize: 11,
    marginTop: 4
  },
  taskBadges: {
    alignItems: 'flex-end',
    gap: 6
  },
  badge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'capitalize'
  },
  taskMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10
  },
  taskMetaLabel: {
    color: colors.mutedForeground,
    fontSize: 10
  },
  taskMetaValue: {
    color: colors.foreground,
    fontSize: 12,
    fontWeight: '600',
    marginTop: 3
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8
  },
  actionButton: {
    flex: 1
  }
});
