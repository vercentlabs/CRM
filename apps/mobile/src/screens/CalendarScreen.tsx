import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import AppTopbar from '../components/AppTopbar';
import { apiRequest, type ApiError } from '../services/api';
import { EmptyState, ErrorState, LoadingState } from '../components/ui';
import { useTheme } from '../theme/ThemeProvider';
import type { ThemeColors } from '../theme/colors';
import { useAuth } from '../context/AuthContext';
import type { CalendarStackParamList } from '../navigation/CalendarStack';

type CalendarEvent = {
  id: number;
  title: string;
  description?: string | null;
  start_date: string;
  end_date?: string | null;
  priority?: string | null;
  status?: string | null;
  user_id?: number | null;
  user_name?: string | null;
  event_type?: string | null;
};

const priorityLabels: Record<string, { bg: string; text: string }> = {
  high: { bg: 'rgba(248, 113, 113, 0.2)', text: '#f87171' },
  medium: { bg: 'rgba(245, 158, 11, 0.2)', text: '#f59e0b' },
  low: { bg: 'rgba(34, 197, 94, 0.2)', text: '#22c55e' }
};

const statusLabels: Record<string, { bg: string; text: string }> = {
  completed: { bg: 'rgba(34, 197, 94, 0.2)', text: '#22c55e' },
  in_progress: { bg: 'rgba(59, 130, 246, 0.2)', text: '#60a5fa' },
  cancelled: { bg: 'rgba(148, 163, 184, 0.2)', text: '#cbd5f5' },
  pending: { bg: 'rgba(245, 158, 11, 0.2)', text: '#f59e0b' },
  overdue: { bg: 'rgba(248, 113, 113, 0.2)', text: '#f87171' }
};

const EVENT_CATEGORIES = [
  { name: 'Team Events', color: '#6366f1', bg: 'rgba(99, 102, 241, 0.12)' },
  { name: 'Work', color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.12)' },
  { name: 'External', color: '#38bdf8', bg: 'rgba(56, 189, 248, 0.12)' },
  { name: 'Projects', color: '#2dd4bf', bg: 'rgba(45, 212, 191, 0.12)' },
  { name: 'Applications', color: '#f472b6', bg: 'rgba(244, 114, 182, 0.12)' },
  { name: 'Design', color: '#fb923c', bg: 'rgba(251, 146, 60, 0.12)' }
];

type CalendarView = 'month' | 'week' | 'day';

const CalendarScreen = () => {
  const navigation = useNavigation<NativeStackNavigationProp<CalendarStackParamList>>();
  const { theme } = useTheme();
  const { colors } = theme;
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { user, isSales } = useAuth();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<CalendarView>('month');
  const [currentDate, setCurrentDate] = useState(new Date());

  const loadEvents = useCallback(async (isRefresh = false) => {
    setError(null);
    if (!isRefresh) {
      setLoading(true);
    }
    try {
      const data = await apiRequest<{ events?: CalendarEvent[] }>('/calendar');
      const list = data.events || [];
      const filtered =
        isSales() && user?.id
          ? list.filter(
              (event) =>
                event.user_id === user.id || (event as { userId?: number }).userId === user.id
            )
          : list;
      setEvents(filtered);
    } catch (err) {
      const apiError = err as ApiError;
      setError(apiError.message || 'Failed to load calendar.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isSales, user?.id]);

  useFocusEffect(
    useCallback(() => {
      void loadEvents();
    }, [loadEvents])
  );

  const handleRefresh = () => {
    setRefreshing(true);
    void loadEvents(true);
  };

  const sortedEvents = useMemo(() => {
    return [...events].sort((a, b) => {
      const aTime = new Date(a.start_date).getTime();
      const bTime = new Date(b.start_date).getTime();
      return aTime - bTime;
    });
  }, [events]);

  const todayStart = useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }, []);

  const getRangeForView = useCallback(
    (date: Date, nextView: CalendarView) => {
      if (nextView === 'day') {
        const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        const end = new Date(start);
        end.setDate(end.getDate() + 1);
        return { start, end };
      }
      if (nextView === 'week') {
        const start = new Date(date);
        start.setDate(date.getDate() - date.getDay());
        start.setHours(0, 0, 0, 0);
        const end = new Date(start);
        end.setDate(start.getDate() + 7);
        return { start, end };
      }
      const start = new Date(date.getFullYear(), date.getMonth(), 1);
      const end = new Date(date.getFullYear(), date.getMonth() + 1, 1);
      return { start, end };
    },
    []
  );

  const { start: rangeStart, end: rangeEnd } = useMemo(
    () => getRangeForView(currentDate, view),
    [currentDate, view, getRangeForView]
  );

  const filteredEvents = useMemo(() => {
    return sortedEvents.filter((event) => {
      const eventDate = new Date(event.start_date);
      return eventDate >= rangeStart && eventDate < rangeEnd;
    });
  }, [sortedEvents, rangeStart, rangeEnd]);

  const formatDateKey = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    filteredEvents.forEach((event) => {
      const key = formatDateKey(new Date(event.start_date));
      const list = map.get(key) || [];
      list.push(event);
      map.set(key, list);
    });
    return map;
  }, [filteredEvents]);

  const monthCells = useMemo(() => {
    if (view !== 'month') return [];
    const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
    const startWeekday = startOfMonth.getDay();
    const cells: Array<{ key: string; date: Date | null; isCurrent: boolean }> = [];

    for (let i = 0; i < startWeekday; i += 1) {
      cells.push({ key: `pad-start-${i}`, date: null, isCurrent: false });
    }

    for (let day = 1; day <= endOfMonth.getDate(); day += 1) {
      const date = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
      cells.push({ key: formatDateKey(date), date, isCurrent: true });
    }

    while (cells.length % 7 !== 0) {
      const key = `pad-end-${cells.length}`;
      cells.push({ key, date: null, isCurrent: false });
    }

    return cells;
  }, [currentDate, view]);

  const upcomingEvents = useMemo(() => {
    return sortedEvents.filter((event) => new Date(event.start_date) >= todayStart).slice(0, 5);
  }, [sortedEvents, todayStart]);

  const changeDate = (direction: number) => {
    setCurrentDate((prev) => {
      const next = new Date(prev);
      if (view === 'month') {
        next.setMonth(next.getMonth() + direction);
      } else if (view === 'week') {
        next.setDate(next.getDate() + direction * 7);
      } else {
        next.setDate(next.getDate() + direction);
      }
      return next;
    });
  };

  const rangeLabel = useMemo(() => {
    if (view === 'month') {
      return currentDate.toLocaleDateString(undefined, {
        month: 'long',
        year: 'numeric'
      });
    }
    if (view === 'week') {
      const startLabel = rangeStart.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric'
      });
      const endLabel = new Date(rangeEnd.getTime() - 1).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });
      return `${startLabel} - ${endLabel}`;
    }
    return currentDate.toLocaleDateString(undefined, {
      weekday: 'long',
      month: 'short',
      day: 'numeric'
    });
  }, [currentDate, rangeEnd, rangeStart, view]);

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
        <AppTopbar placeholder="Search calendar..." />

        <ScrollView contentContainerStyle={styles.scrollContent}>
          <LinearGradient colors={['#4f46e5', '#8b5cf6']} style={styles.heroCard}>
            <View style={styles.heroRow}>
              <View style={styles.heroText}>
                <Text style={styles.heroTitle}>Calendar</Text>
                <Text style={styles.heroSubtitle}>Upcoming tasks and deadlines</Text>
                <View style={styles.heroChip}>
                  <Feather name="calendar" size={12} color="#ffffff" />
                  <Text style={styles.heroChipText}>{events.length} Events</Text>
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
                  onPress={() => navigation.navigate('CalendarEventForm')}
                >
                  <Feather name="plus" size={12} color="#4f46e5" />
                  <Text style={styles.heroPrimaryText}>Add Event</Text>
                </Pressable>
              </View>
            </View>
          </LinearGradient>

          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Calendar Views</Text>
            <View style={styles.controlsRow}>
              <View style={styles.controlsGroup}>
                <Pressable style={styles.iconButton} onPress={() => changeDate(-1)}>
                  <Feather name="chevron-left" size={16} color="#e5e7eb" />
                </Pressable>
                <Pressable style={styles.todayButton} onPress={() => setCurrentDate(new Date())}>
                  <Text style={styles.todayButtonText}>Today</Text>
                </Pressable>
                <Pressable style={styles.iconButton} onPress={() => changeDate(1)}>
                  <Feather name="chevron-right" size={16} color="#e5e7eb" />
                </Pressable>
              </View>
              <Text style={styles.rangeLabel}>{rangeLabel}</Text>
            </View>
            <View style={styles.viewButtons}>
              {(['month', 'week', 'day'] as CalendarView[]).map((option) => (
                <Pressable
                  key={option}
                  onPress={() => setView(option)}
                  style={[
                    styles.viewButton,
                    view === option ? styles.viewButtonActive : null
                  ]}
                >
                  <Text
                    style={[
                      styles.viewButtonText,
                      view === option ? styles.viewButtonTextActive : null
                    ]}
                  >
                    {option.charAt(0).toUpperCase() + option.slice(1)}
                  </Text>
                </Pressable>
              ))}
            </View>

            {view === 'month' ? (
              <View style={styles.calendarGrid}>
                <View style={styles.weekdayRow}>
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((label) => (
                    <Text key={label} style={styles.weekdayLabel}>
                      {label}
                    </Text>
                  ))}
                </View>
                <View style={styles.monthGrid}>
                  {monthCells.map((cell) => {
                    if (!cell.date) {
                      return <View key={cell.key} style={styles.dayCell} />;
                    }
                    const isToday = formatDateKey(cell.date) === formatDateKey(new Date());
                    const dayEvents = eventsByDay.get(cell.key) || [];
                    return (
                      <Pressable
                        key={cell.key}
                        style={[styles.dayCell, isToday && styles.dayCellToday]}
                        onPress={() => setCurrentDate(cell.date as Date)}
                      >
                        <Text style={[styles.dayNumber, isToday && styles.dayNumberToday]}>
                          {cell.date.getDate()}
                        </Text>
                        {dayEvents.length > 0 ? (
                          <View style={styles.dayDots}>
                            {dayEvents.slice(0, 3).map((_, index) => (
                              <View key={`${cell.key}-dot-${index}`} style={styles.dayDot} />
                            ))}
                            {dayEvents.length > 3 ? (
                              <Text style={styles.moreDotText}>+{dayEvents.length - 3}</Text>
                            ) : null}
                          </View>
                        ) : null}
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : (
              <View style={styles.dayList}>
                {filteredEvents.length === 0 ? (
                  <Text style={styles.emptyDayText}>No events for this range.</Text>
                ) : (
                  filteredEvents.map((event) => (
                    <View key={`range-${event.id}`} style={styles.dayListRow}>
                      <Text style={styles.dayListTime}>
                        {formatDate(event.start_date)} {formatTime(event.start_date)}
                      </Text>
                      <Text style={styles.dayListTitle} numberOfLines={1}>
                        {event.title}
                      </Text>
                    </View>
                  ))
                )}
              </View>
            )}
          </View>

          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Event Categories</Text>
            <Text style={styles.sectionHelper}>
              Drag and drop events or tap into the calendar grid in the web view.
            </Text>
            <View style={styles.categoryList}>
              {EVENT_CATEGORIES.map((category) => (
                <View
                  key={category.name}
                  style={[styles.categoryChip, { backgroundColor: category.bg }]}
                >
                  <View style={[styles.categoryDot, { backgroundColor: category.color }]} />
                  <Text style={styles.categoryText}>{category.name}</Text>
                </View>
              ))}
            </View>
          </View>

          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Upcoming Events</Text>
            {upcomingEvents.length === 0 ? (
              <EmptyState title="No upcoming events" message="You are all caught up." />
            ) : (
              upcomingEvents.map((event) => (
                <View key={event.id} style={styles.upcomingCard}>
                  <View style={styles.upcomingDetails}>
                    <Text style={styles.upcomingTitle} numberOfLines={1}>
                      {event.title}
                    </Text>
                    <Text style={styles.upcomingDate}>
                      {formatDate(event.start_date)}
                    </Text>
                  </View>
                  <View style={styles.upcomingBadge}>
                    <Text style={styles.upcomingBadgeText}>{event.priority || 'medium'}</Text>
                  </View>
                </View>
              ))
            )}
          </View>

          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Scheduled Events</Text>
            {loading && events.length === 0 ? (
              <LoadingState label="Loading calendar..." />
            ) : error ? (
              <ErrorState title="Unable to load calendar" message={error} onAction={handleRefresh} />
            ) : filteredEvents.length === 0 ? (
              <EmptyState title="No events scheduled" message="Create an event to get started." />
            ) : (
              filteredEvents.map((event) => {
                const priority = priorityLabels[event.priority || 'medium'] || priorityLabels.medium;
                const status = statusLabels[event.status || 'pending'] || statusLabels.pending;
                return (
                  <View key={event.id} style={styles.eventCard}>
                    <View style={styles.eventHeader}>
                      <View style={styles.eventTitle}>
                        <Text style={styles.eventName}>{event.title}</Text>
                        <Text style={styles.eventMeta}>
                          {formatDate(event.start_date)} {formatTime(event.start_date)}
                        </Text>
                      </View>
                      <View style={[styles.badge, { backgroundColor: priority.bg }]}>
                        <Text style={[styles.badgeText, { color: priority.text }]}>
                          {event.priority || 'medium'}
                        </Text>
                      </View>
                    </View>
                    {event.description ? (
                      <Text style={styles.eventDescription}>{event.description}</Text>
                    ) : null}
                    <View style={styles.eventRow}>
                      <View style={[styles.badge, { backgroundColor: status.bg }]}>
                        <Text style={[styles.badgeText, { color: status.text }]}>
                          {event.status || 'pending'}
                        </Text>
                      </View>
                      <Text style={styles.eventOwner}>{event.user_name || 'Unassigned'}</Text>
                    </View>
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

export default CalendarScreen;

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
    borderColor: colors.border,
    marginBottom: 16
  },
  sectionTitle: {
    color: colors.foreground,
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 12
  },
  sectionHelper: {
    color: colors.mutedForeground,
    fontSize: 11,
    marginBottom: 12
  },
  eventCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    marginBottom: 12,
    backgroundColor: colors.inputBg
  },
  eventHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
    gap: 10
  },
  eventTitle: {
    flex: 1
  },
  eventName: {
    color: colors.foreground,
    fontSize: 14,
    fontWeight: '700'
  },
  eventMeta: {
    color: colors.mutedForeground,
    fontSize: 11,
    marginTop: 2
  },
  eventDescription: {
    color: colors.mutedForeground,
    fontSize: 11,
    marginBottom: 8
  },
  eventRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  eventOwner: {
    color: colors.mutedForeground,
    fontSize: 11
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
  controlsRow: {
    gap: 10,
    marginBottom: 12
  },
  controlsGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  iconButton: {
    width: 32,
    height: 32,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.inputBg
  },
  todayButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.inputBg
  },
  todayButtonText: {
    color: colors.foreground,
    fontSize: 11,
    fontWeight: '600'
  },
  rangeLabel: {
    color: colors.foreground,
    fontSize: 12,
    fontWeight: '600'
  },
  viewButtons: {
    flexDirection: 'row',
    gap: 8
  },
  calendarGrid: {
    marginTop: 12
  },
  weekdayRow: {
    flexDirection: 'row',
    marginBottom: 8
  },
  weekdayLabel: {
    width: '14.2857%',
    textAlign: 'center',
    color: colors.mutedForeground,
    fontSize: 10,
    fontWeight: '600'
  },
  monthGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap'
  },
  dayCell: {
    width: '14.2857%',
    minHeight: 54,
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'flex-start',
    marginBottom: 6
  },
  dayCellToday: {
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.4)'
  },
  dayNumber: {
    color: colors.foreground,
    fontSize: 12,
    fontWeight: '600'
  },
  dayNumberToday: {
    color: colors.foreground
  },
  dayDots: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginTop: 6,
    gap: 2
  },
  dayDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#6366f1'
  },
  moreDotText: {
    color: colors.mutedForeground,
    fontSize: 8,
    marginTop: 2
  },
  dayList: {
    marginTop: 12,
    gap: 8
  },
  dayListRow: {
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.inputBg
  },
  dayListTime: {
    color: colors.mutedForeground,
    fontSize: 10
  },
  dayListTitle: {
    color: colors.foreground,
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4
  },
  emptyDayText: {
    color: colors.mutedForeground,
    fontSize: 11,
    textAlign: 'center'
  },
  viewButton: {
    flex: 1,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center'
  },
  viewButtonActive: {
    backgroundColor: '#4f46e5',
    borderColor: '#4f46e5'
  },
  viewButtonText: {
    color: colors.mutedForeground,
    fontSize: 11,
    fontWeight: '600'
  },
  viewButtonTextActive: {
    color: colors.primaryForeground
  },
  categoryList: {
    gap: 8
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999
  },
  categoryDot: {
    width: 10,
    height: 10,
    borderRadius: 4,
    marginRight: 8
  },
  categoryText: {
    color: colors.foreground,
    fontSize: 12,
    fontWeight: '600'
  },
  upcomingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.inputBg,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 10
  },
  upcomingDetails: {
    flex: 1,
    marginRight: 10
  },
  upcomingTitle: {
    color: colors.foreground,
    fontSize: 12,
    fontWeight: '600'
  },
  upcomingDate: {
    color: colors.mutedForeground,
    fontSize: 10,
    marginTop: 4
  },
  upcomingBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(99, 102, 241, 0.2)'
  },
  upcomingBadgeText: {
    color: '#c7d2fe',
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'capitalize'
  },
  errorText: {
    color: '#f87171',
    fontSize: 11,
    marginBottom: 8
  }
});
