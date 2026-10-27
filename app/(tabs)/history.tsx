/**
 * @file history.tsx
 * @description Past workout logs, newest first, filterable by status.
 * Skipped workouts are struck through, like on the week strip. Tap one to open it.
 */
import { format, parseISO } from 'date-fns';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, View } from 'react-native';
import { ActivityIndicator, SegmentedButtons, Text, TouchableRipple, useTheme } from 'react-native-paper';
import { EmptyState } from '../../components/EmptyState';
import { getHistory, type HistoryRow, type LogStatus } from '../../lib/db';
import { statusColor, statusLabel } from '../../lib/status';
import { formatDuration } from '../../lib/workout';
import type { DayState } from '../../lib/week';

type Filter = 'all' | LogStatus;

/** What each filter shows when it has nothing, so the empty state says why. */
const EMPTY: Record<Filter, { title: string; body: string }> = {
  all: { title: 'No workouts logged', body: 'Completed, skipped and missed workouts will show up here.' },
  completed: { title: 'Nothing completed yet', body: 'Finish a workout from the Today tab and it lands here.' },
  skipped: { title: 'No skipped workouts', body: 'Workouts you skip, with their reason, show up here.' },
  missed: { title: 'Nothing missed', body: 'Scheduled days you never logged show up here.' },
};

/**
 * @returns The history screen
 */
export default function HistoryScreen() {
  const { colors } = useTheme();
  const [filter, setFilter] = useState<Filter>('all');
  const [rows, setRows] = useState<HistoryRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    () =>
      getHistory(filter === 'all' ? null : filter)
        .then((r) => { setRows(r); setError(null); })
        .catch((e: unknown) => setError(String(e))),
    [filter],
  );
  // Reload on focus so a workout logged on another tab shows up.
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  let body;
  if (error) body = <EmptyState icon="alert-circle-outline" title="Couldn't load history" body={error} />;
  else if (!rows) body = <ActivityIndicator style={{ flex: 1 }} />;
  else
    body = (
      <FlatList
        data={rows}
        keyExtractor={(r) => String(r.id)}
        refreshing={refreshing}
        onRefresh={refresh}
        contentContainerStyle={rows.length === 0 ? { flexGrow: 1 } : { paddingBottom: 24 }}
        ListEmptyComponent={<EmptyState icon="history" {...EMPTY[filter]} />}
        ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: colors.outlineVariant, marginLeft: 16 }} />}
        renderItem={({ item }) => <HistoryItem row={item} />}
      />
    );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SegmentedButtons
        value={filter}
        onValueChange={(v) => { setRows(null); setFilter(v as Filter); }}
        style={{ margin: 16 }}
        density="small"
        buttons={[
          { value: 'all', label: 'All' },
          { value: 'completed', label: 'Done' },
          { value: 'skipped', label: 'Skipped' },
          { value: 'missed', label: 'Missed' },
        ]}
      />
      {body}
    </View>
  );
}

/**
 * One past log: a status-colored edge, date, workout name and what was done.
 * @param props - The log row
 * @returns The row
 */
function HistoryItem({ row }: { row: HistoryRow }) {
  const { colors } = useTheme();
  const state: DayState = row.status === 'missed' && row.excused ? 'break' : row.status;
  const day = { state, warning: 0 as const, isToday: false };
  const detail =
    row.status === 'completed'
      ? [`${row.set_count} ${row.set_count === 1 ? 'set' : 'sets'}`, row.duration_seconds ? formatDuration(row.duration_seconds) : null].filter(Boolean).join(', ')
      : row.notes;
  return (
    <TouchableRipple
      onPress={() => router.push({ pathname: '/workout/log/[date]', params: { date: row.date } })}
      style={{ backgroundColor: colors.surface }}
      accessibilityLabel={`${row.template_name}, ${format(parseISO(row.date), 'EEEE MMMM d')}, ${statusLabel(day)}`}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingRight: 16 }}>
        <View style={{ width: 4, alignSelf: 'stretch', backgroundColor: statusColor(day, colors), marginRight: 12 }} />
        <View style={{ width: 52 }}>
          <Text variant="labelMedium" style={{ color: colors.onSurfaceVariant }}>{format(parseISO(row.date), 'EEE')}</Text>
          <Text variant="titleLarge">{format(parseISO(row.date), 'MMM d')}</Text>
        </View>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text
            variant="titleMedium"
            style={row.status !== 'completed' ? { textDecorationLine: row.status === 'skipped' ? 'line-through' : 'none', color: colors.onSurfaceVariant } : undefined}
          >
            {row.template_name}
          </Text>
          {!!detail && <Text variant="bodySmall" numberOfLines={1} style={{ color: colors.onSurfaceVariant }}>{detail}</Text>}
        </View>
        <Text variant="labelMedium" style={{ color: colors.onSurfaceVariant }}>{statusLabel(day)}</Text>
      </View>
    </TouchableRipple>
  );
}
