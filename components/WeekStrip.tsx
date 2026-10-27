/**
 * @file WeekStrip.tsx
 * @description Horizontally scrolling row of this week's days. Each card has a
 * thick colored edge, like a plate rim, that shows its status at a glance.
 */
import { format, parseISO } from 'date-fns';
import { useEffect, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, View, type ScrollViewInstance } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import { statusColor, statusLabel } from '../lib/status';
import { FONT } from '../lib/theme';
import type { DayCard } from '../lib/week';

const CARD_W = 96;
const GAP = 8;
const PAD = 16;

type Props = { days: DayCard[]; onPressDay: (day: DayCard) => void };

/**
 * The week strip.
 * @param props - Days to show and the tap handler
 * @returns The strip
 */
export function WeekStrip({ days, onPressDay }: Props) {
  const { colors } = useTheme();
  const scroll = useRef<ScrollViewInstance>(null);
  const todayIndex = days.findIndex((d) => d.isToday);

  // Bring today into view; the strip starts at the first day of the week.
  useEffect(() => {
    if (todayIndex > 0) scroll.current?.scrollTo({ x: Math.max(0, todayIndex - 1) * (CARD_W + GAP), animated: true });
  }, [todayIndex]);

  return (
    <ScrollView ref={scroll} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {days.map((day) => {
        const dim = day.state === 'rest' || day.state === 'untracked';
        const label = statusLabel(day);
        return (
          <Pressable
            key={day.date}
            onPress={() => onPressDay(day)}
            accessibilityRole="button"
            accessibilityLabel={`${format(parseISO(day.date), 'EEEE MMMM d')}: ${day.name ?? 'rest day'}${label ? `, ${label}` : ''}`}
            style={({ pressed }) => [
              styles.card,
              {
                backgroundColor: colors.surface,
                borderBottomColor: statusColor(day, colors),
                borderColor: day.isToday ? colors.primary : 'transparent',
                opacity: pressed ? 0.7 : 1,
              },
            ]}
          >
            <Text variant="labelMedium" style={{ color: day.isToday ? colors.primary : colors.onSurfaceVariant }}>
              {format(parseISO(day.date), 'EEE')}
            </Text>
            <Text style={[styles.num, { color: dim ? colors.onSurfaceVariant : colors.onSurface }]}>{format(parseISO(day.date), 'd')}</Text>
            <Text
              numberOfLines={2}
              style={[
                styles.name,
                { color: dim || day.state === 'skipped' || day.state === 'missed' ? colors.onSurfaceVariant : colors.onSurface },
                day.state === 'skipped' && styles.strike,
              ]}
            >
              {day.name ?? 'Rest'}
            </Text>
            <View style={{ flex: 1 }} />
            {label !== '' && day.state !== 'rest' && (
              <Text variant="labelSmall" style={{ color: day.state === 'upcoming' && day.warning ? statusColor(day, colors) : colors.onSurfaceVariant }}>
                {label}
              </Text>
            )}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: PAD, gap: GAP },
  card: { width: CARD_W, minHeight: 132, padding: 10, borderRadius: 6, borderWidth: 2, borderBottomWidth: 6 },
  num: { fontFamily: FONT.display, fontSize: 34, lineHeight: 38 },
  name: { fontFamily: FONT.title, fontSize: 16, lineHeight: 18 },
  strike: { textDecorationLine: 'line-through' },
});
