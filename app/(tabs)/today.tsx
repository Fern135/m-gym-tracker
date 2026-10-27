/**
 * @file today.tsx
 * @description Today's workout (start, skip with a reason, or rest day), any
 * missed weeks waiting for a reason, and this week as a scrolling strip.
 */
import { format, parseISO } from 'date-fns';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Banner, Button, Text, useTheme } from 'react-native-paper';
import { EmptyState } from '../../components/EmptyState';
import { ReasonDialog } from '../../components/ReasonDialog';
import { WeekStrip } from '../../components/WeekStrip';
import { addBreak, skipWorkout } from '../../lib/db';
import { rescheduleAll } from '../../lib/notifications';
import { statusColor } from '../../lib/status';
import { useAppStore } from '../../lib/store';
import { FONT } from '../../lib/theme';
import { loadToday, type TodayData } from '../../lib/today';
import type { DayCard } from '../../lib/week';
import { formatDuration } from '../../lib/workout';

const SKIP_REASONS = ['Short on time', 'Feeling unwell', 'Low energy', 'Hungry', 'Sore'];
const BREAK_REASONS = ['Health', "Doctor's orders", 'Injury', 'Travel', 'Busy'];

/**
 * @returns The Today screen
 */
export default function TodayScreen() {
  const { colors } = useTheme();
  const firstDay = useAppStore((s) => s.firstDayOfWeek);
  const [data, setData] = useState<TodayData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [skipping, setSkipping] = useState(false);
  const [explaining, setExplaining] = useState(false);
  const [bannerHidden, setBannerHidden] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await loadToday(firstDay));
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  }, [firstDay]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  if (error && !data) return <EmptyState icon="alert-circle-outline" title="Couldn't load today" body={error} />;
  if (!data) return <ActivityIndicator style={{ flex: 1, backgroundColor: colors.background }} />;

  const { todayCard: day, exercises, week, missedRuns } = data;
  const run = missedRuns[missedRuns.length - 1];
  const openDay = (d: DayCard) => router.push({ pathname: '/workout/log/[date]', params: { date: d.date } });

  const skip = async (reason: string) => {
    await skipWorkout({ template_id: day.templateId, template_name: day.name ?? 'Workout', date: day.date, reason });
    await rescheduleAll(); // drops today's evening check-in
    setSkipping(false);
    load();
  };
  const explain = async (reason: string) => {
    if (!run) return;
    await addBreak(run.start, run.end, reason);
    setExplaining(false);
    load();
  };

  const runText = run && `You missed ${run.weeks === 1 ? 'a week' : `${run.weeks} weeks`} (${format(parseISO(run.start), 'MMM d')} – ${format(parseISO(run.end), 'MMM d')}). Add a reason?`;

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={{ paddingBottom: 32 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
    >
      <Banner
        visible={!!run && !bannerHidden}
        icon="calendar-alert"
        actions={[
          { label: 'Not now', onPress: () => setBannerHidden(true) },
          { label: 'Add reason', onPress: () => setExplaining(true) },
        ]}
      >
        {runText}
      </Banner>

      <Text style={[styles.date, { color: colors.onSurface }]}>{format(new Date(), 'EEEE, MMMM d')}</Text>

      <View style={[styles.hero, { backgroundColor: colors.surface, borderLeftColor: statusColor(day, colors) }]}>
        <HeroContent
          day={day}
          exercises={exercises}
          onOpen={() => openDay(day)}
          onStart={() => router.push({ pathname: '/workout/log/[date]', params: { date: day.date, start: '1' } })}
          onSkip={() => setSkipping(true)}
          weekEmpty={week.every((d) => d.state === 'rest')}
        />
      </View>

      <Text variant="titleLarge" style={styles.weekTitle}>This week</Text>
      <WeekStrip days={week} onPressDay={openDay} />

      <ReasonDialog
        visible={skipping}
        title={`Why skip ${day.name ?? 'today'}?`}
        body="Skipping with a reason won't count against you."
        presets={SKIP_REASONS}
        confirmLabel="Skip workout"
        onConfirm={skip}
        onDismiss={() => setSkipping(false)}
      />
      <ReasonDialog
        visible={explaining}
        title="Why were you away?"
        body={run ? `${format(parseISO(run.start), 'MMM d')} – ${format(parseISO(run.end), 'MMM d')}. Workouts missed in this stretch won't count against you.` : undefined}
        presets={BREAK_REASONS}
        confirmLabel="Save reason"
        onConfirm={explain}
        onDismiss={() => setExplaining(false)}
      />
    </ScrollView>
  );
}

type HeroProps = {
  day: DayCard;
  exercises: string[];
  onOpen: () => void;
  onStart: () => void;
  onSkip: () => void;
  /** Nothing scheduled or logged all week, e.g. on first launch: point to setup instead. */
  weekEmpty: boolean;
};

/**
 * The big card for today: what to do and the buttons to do it.
 * @param props - Today's card, its exercises and handlers
 * @returns Card content for the current state
 */
function HeroContent({ day, exercises, onOpen, onStart, onSkip, weekEmpty }: HeroProps) {
  const { colors } = useTheme();
  const muted = { color: colors.onSurfaceVariant };

  if (day.state === 'rest' && weekEmpty) {
    return (
      <>
        <Text style={[styles.heroName, { color: colors.onSurface }]}>Plan your week</Text>
        <Text variant="bodyMedium" style={muted}>Nothing is scheduled this week. Create a workout, then put it on the days you train.</Text>
        <Button mode="contained" icon="plus" onPress={() => router.push('/workout/template/new')} style={styles.cta}>Create a workout</Button>
        <Button icon="calendar-week" onPress={() => router.push('/schedule')} style={{ alignSelf: 'flex-start', marginTop: 4 }}>Open schedule</Button>
      </>
    );
  }
  if (day.state === 'rest') {
    return (
      <>
        <Text style={[styles.heroName, { color: colors.onSurface }]}>Rest day</Text>
        <Text variant="bodyMedium" style={muted}>Nothing scheduled today. Recover, or log something extra.</Text>
        <Button mode="outlined" icon="plus" onPress={onOpen} style={styles.cta}>Log a workout anyway</Button>
      </>
    );
  }
  if (day.state === 'completed') {
    return (
      <>
        <Text style={[styles.heroName, { color: colors.onSurface }]}>{day.name}</Text>
        <Text variant="bodyMedium" style={muted}>
          {day.log?.duration_seconds ? `Done for today in ${formatDuration(day.log.duration_seconds)}.` : 'Done for today.'}
        </Text>
        <Button mode="outlined" icon="eye-outline" onPress={onOpen} style={styles.cta}>View workout</Button>
      </>
    );
  }
  if (day.state === 'skipped') {
    return (
      <>
        <Text style={[styles.heroName, styles.strike, muted]}>{day.name}</Text>
        <Text variant="bodyMedium" style={muted}>Skipped{day.log?.notes ? `: ${day.log.notes}` : ''}.</Text>
        <Button mode="outlined" icon="check" onPress={onOpen} style={styles.cta}>Log it anyway</Button>
      </>
    );
  }

  const warningText =
    day.warning === 2
      ? "You've missed this workout twice in a row. Get this one in."
      : day.warning === 1 && day.lastMissed
        ? `You missed it last ${format(parseISO(day.lastMissed), 'EEEE')}. Don't miss this one.`
        : null;

  return (
    <>
      <Text style={[styles.heroName, { color: colors.onSurface }]}>{day.name}</Text>
      {warningText && <Text variant="bodyMedium" style={{ color: statusColor(day, colors), marginBottom: 4 }}>{warningText}</Text>}
      <Text variant="bodyMedium" style={muted}>{exercises.length ? exercises.join(', ') : 'No exercises yet. Add some in Workouts.'}</Text>
      <Button mode="contained" icon="play" onPress={onStart} style={styles.cta} contentStyle={{ paddingVertical: 6 }}>Start workout</Button>
      <Button onPress={onSkip} style={{ alignSelf: 'flex-start', marginTop: 4 }}>Skip today</Button>
    </>
  );
}

const styles = StyleSheet.create({
  date: { fontFamily: FONT.display, fontSize: 30, lineHeight: 34, paddingHorizontal: 16, marginTop: 16, marginBottom: 12 },
  hero: { marginHorizontal: 16, padding: 16, borderRadius: 8, borderLeftWidth: 8, gap: 4 },
  heroName: { fontFamily: FONT.display, fontSize: 36, lineHeight: 40 },
  strike: { textDecorationLine: 'line-through' },
  cta: { marginTop: 16 },
  weekTitle: { paddingHorizontal: 16, marginTop: 28, marginBottom: 10 },
});
