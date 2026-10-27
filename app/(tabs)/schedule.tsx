/**
 * @file schedule.tsx
 * @description The recurring weekly schedule: seven days in the order set by
 * first_day_of_week. Tap a day to assign a workout or make it a rest day.
 */
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Button, Dialog, HelperText, Portal, RadioButton, Text, useTheme } from 'react-native-paper';
import { EmptyState } from '../../components/EmptyState';
import { getSchedule, listTemplates, setScheduleDay, type ScheduleDay, type TemplateSummary } from '../../lib/db';
import { DAY_NAMES, orderedDays } from '../../lib/days';
import { rescheduleAll } from '../../lib/notifications';
import { useAppStore } from '../../lib/store';
import { FONT, plate } from '../../lib/theme';

/**
 * @returns The schedule screen
 */
export default function ScheduleScreen() {
  const { colors } = useTheme();
  const firstDay = useAppStore((s) => s.firstDayOfWeek);
  const [schedule, setSchedule] = useState<ScheduleDay[] | null>(null);
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [editing, setEditing] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    Promise.all([getSchedule(), listTemplates()])
      .then(([s, t]) => { setSchedule(s); setTemplates(t); setError(null); })
      .catch((e: unknown) => setError(String(e)));
  }, []);
  useFocusEffect(load);

  const assign = async (day: number, value: string) => {
    setEditing(null);
    try {
      await setScheduleDay(day, value === 'rest' ? null : Number(value));
      await rescheduleAll();
      load();
    } catch (e) {
      setError(String(e));
    }
  };

  if (!schedule) {
    return error
      ? <EmptyState icon="alert-circle-outline" title="Couldn't load your schedule" body={error} />
      : <ActivityIndicator style={{ flex: 1, backgroundColor: colors.background }} />;
  }
  if (templates.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <EmptyState icon="calendar-week" title="Create a workout first" body="Once you have a workout like Upper Body, you can put it on your week here.">
          <Button mode="contained" icon="plus" onPress={() => router.push('/workout/template/new')} style={{ marginTop: 16 }}>
            New workout
          </Button>
        </EmptyState>
      </View>
    );
  }

  const byDay = new Map(schedule.map((s) => [s.day_of_week, s]));
  const today = new Date().getDay();
  const editingEntry = editing !== null ? byDay.get(editing) : undefined;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView contentContainerStyle={styles.list}>
        {error && <HelperText type="error">{error}</HelperText>}
        {orderedDays(firstDay).map((day) => {
          const entry = byDay.get(day);
          return (
            <Pressable
              key={day}
              onPress={() => setEditing(day)}
              accessibilityRole="button"
              accessibilityLabel={`${DAY_NAMES[day]}: ${entry ? entry.template_name : 'rest day'}. Tap to change.`}
              style={({ pressed }) => [
                styles.day,
                { backgroundColor: colors.surface, borderLeftColor: entry ? plate.blue : colors.outlineVariant, opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.dayName, { color: day === today ? colors.primary : colors.onSurface }]}>
                  {DAY_NAMES[day]}
                </Text>
                <Text variant="bodyLarge" style={{ color: entry ? colors.onSurface : colors.onSurfaceVariant }}>
                  {entry ? entry.template_name : 'Rest day'}
                </Text>
              </View>
              {day === today && <Text variant="labelMedium" style={{ color: colors.primary, marginRight: 12 }}>Today</Text>}
              <MaterialCommunityIcons name="pencil-outline" size={20} color={colors.onSurfaceVariant} />
            </Pressable>
          );
        })}
      </ScrollView>

      <Portal>
        <Dialog visible={editing !== null} onDismiss={() => setEditing(null)}>
          <Dialog.Title>{editing !== null ? DAY_NAMES[editing] : ''}</Dialog.Title>
          <Dialog.ScrollArea style={{ maxHeight: 360, paddingHorizontal: 0 }}>
            <ScrollView>
              <RadioButton.Group
                value={editingEntry ? String(editingEntry.template_id) : 'rest'}
                onValueChange={(v) => editing !== null && assign(editing, v)}
              >
                {templates.map((t) => <RadioButton.Item key={t.id} label={t.name} value={String(t.id)} />)}
                <RadioButton.Item label="Rest day" value="rest" />
              </RadioButton.Group>
            </ScrollView>
          </Dialog.ScrollArea>
          <Dialog.Actions>
            <Button onPress={() => setEditing(null)}>Cancel</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </View>
  );
}

const styles = StyleSheet.create({
  list: { padding: 16, gap: 8 },
  day: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 16, borderRadius: 6, borderLeftWidth: 6 },
  dayName: { fontFamily: FONT.title, fontSize: 22, lineHeight: 26 },
});
