import type { CalendarEvent } from '@crm/types';
import { useNavigation } from '@react-navigation/native';
import { useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { ListRow } from '../../components/lists/PagedList';
import {
  Badge,
  EmptyState,
  ErrorState,
  IconButton,
  LoadingState,
  Screen,
  Text,
} from '../../components/ui';
import { formatTime, isSameDay } from '../../lib/format';
import { TASK_PRIORITY_TONE, TASK_STATUS_LABEL } from '../../lib/labels';
import { useSession } from '../../providers/SessionProvider';
import { useColors } from '../../theme/ThemeProvider';
import { useCalendarEvents } from './hooks';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function monthGrid(month: Date) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const start = new Date(first);
  start.setDate(1 - first.getDay());
  return Array.from(
    { length: 42 },
    (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i),
  );
}

/** Month view over /calendar/events (a projection of tasks); tap a day for its agenda. */
export function CalendarScreen() {
  const navigation = useNavigation();
  const { can } = useSession();
  const c = useColors();
  const [month, setMonth] = useState(
    () => new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  );
  const [selected, setSelected] = useState(() => new Date());
  const days = useMemo(() => monthGrid(month), [month]);
  const range = useMemo(() => {
    const to = new Date(days[41]!);
    to.setHours(23, 59, 59, 999);
    return { from: days[0]!.toISOString(), to: to.toISOString() };
  }, [days]);
  const events = useCalendarEvents(range);

  const byDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const e of events.data ?? []) {
      const d = new Date(e.start_date).toDateString();
      map.set(d, [...(map.get(d) ?? []), e]);
    }
    return map;
  }, [events.data]);
  const agenda = (byDay.get(selected.toDateString()) ?? []).sort((a, b) =>
    a.start_date.localeCompare(b.start_date),
  );

  const shift = (delta: number) =>
    setMonth(new Date(month.getFullYear(), month.getMonth() + delta, 1));
  const newAt = () => {
    const due = new Date(selected);
    due.setHours(10, 0, 0, 0);
    navigation.navigate('TaskForm', { due: due.toISOString() });
  };

  return (
    <Screen
      title="Calendar"
      actions={
        can('crm.tasks.create') ? (
          <IconButton icon="plus" label="New event" onPress={newAt} />
        ) : null
      }
    >
      <ScrollView
        refreshControl={
          <RefreshControl
            refreshing={events.isRefetching}
            onRefresh={() => void events.refetch()}
          />
        }
      >
        <View style={styles.monthBar}>
          <IconButton icon="chevron-left" label="Previous month" onPress={() => shift(-1)} />
          <Text variant="heading" accessibilityRole="header">
            {month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
          </Text>
          <IconButton icon="chevron-right" label="Next month" onPress={() => shift(1)} />
        </View>
        <View style={styles.grid}>
          {WEEKDAYS.map((d, i) => (
            <Text key={i} variant="caption" color="muted" style={styles.weekday}>
              {d}
            </Text>
          ))}
          {days.map((day) => {
            const inMonth = day.getMonth() === month.getMonth();
            const isSelected = isSameDay(day, selected);
            const count = byDay.get(day.toDateString())?.length ?? 0;
            return (
              <Pressable
                key={day.toISOString()}
                onPress={() => setSelected(day)}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                accessibilityLabel={`${day.toDateString()}${count ? `, ${count} events` : ''}`}
                style={[
                  styles.day,
                  isSelected && { backgroundColor: c.primary },
                  isSameDay(day, new Date()) &&
                    !isSelected && { borderColor: c.primary, borderWidth: 1 },
                ]}
              >
                <Text style={{ color: isSelected ? c.primaryFg : inMonth ? c.fg : c.muted }}>
                  {day.getDate()}
                </Text>
                {count ? (
                  <View
                    style={[styles.dot, { backgroundColor: isSelected ? c.primaryFg : c.primary }]}
                  />
                ) : null}
              </Pressable>
            );
          })}
        </View>
        <Text variant="label" style={styles.agendaTitle}>
          {selected.toLocaleDateString(undefined, {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
          })}
        </Text>
        {events.isPending ? (
          <LoadingState />
        ) : events.error ? (
          <ErrorState error={events.error} onRetry={() => void events.refetch()} />
        ) : agenda.length === 0 ? (
          <EmptyState
            icon="calendar"
            title="Nothing scheduled"
            message="Tasks due on this day appear here."
          />
        ) : (
          agenda.map((e) => (
            <ListRow
              key={e.id}
              title={e.title}
              subtitle={[formatTime(e.start_date), e.user_name ?? 'Unassigned'].join(' · ')}
              onPress={() => navigation.navigate('TaskForm', { id: e.id })}
              trailing={
                <Badge label={TASK_STATUS_LABEL[e.status]} tone={TASK_PRIORITY_TONE[e.priority]} />
              }
            />
          ))
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  monthBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingTop: 8,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 8 },
  weekday: { width: `${100 / 7}%`, textAlign: 'center', paddingVertical: 6 },
  day: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
  },
  dot: { width: 5, height: 5, borderRadius: 3, marginTop: 2 },
  agendaTitle: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 4 },
});
