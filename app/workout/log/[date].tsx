/**
 * @file log/[date].tsx
 * @description The workout screen for one date.
 * - Intro: what's planned, Start or Skip (or Log it anyway for a skipped/missed day).
 * - Guided: one exercise at a time with a sets-left counter, Rest timer and Next exercise.
 * - Review: edit everything, add notes, Complete workout.
 * - Done: total time, active time and rest time for the session just completed.
 * - Completed: read-only view with Edit.
 * The workout in progress is saved after every change so it survives the app being killed.
 * Workouts can only be started, skipped or edited on their own date; a workout
 * already started can still be finished after midnight.
 */
import { format, parseISO } from 'date-fns';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Button, Dialog, HelperText, IconButton, Portal, RadioButton, Text, TextInput, useTheme } from 'react-native-paper';
import { LogForm } from '../../../components/LogForm';
import { ExerciseVideo } from '../../../components/ExerciseVideo';
import { NumberField } from '../../../components/NumberField';
import { ReasonDialog } from '../../../components/ReasonDialog';
import { RestTimer } from '../../../components/RestTimer';
import { getLogDetail, getSchedule, getTemplate, listTemplates, saveCompletedLog, skipWorkout, updateLogNotes, type LogDetail, type TemplateSummary } from '../../../lib/db';
import { rescheduleAll } from '../../../lib/notifications';
import { getWorkoutDraft, setWorkoutDraft } from '../../../lib/settings';
import { useAppStore } from '../../../lib/store';
import { FONT, plate } from '../../../lib/theme';
import { toDateStr } from '../../../lib/week';
import { formatClock, formatDuration, formatSet, setsLeftLabel, type DraftExercise, type LoggedSet, type WorkoutDraft } from '../../../lib/workout';

const SKIP_REASONS = ['Short on time', 'Feeling unwell', 'Low energy', 'Hungry', 'Sore'];

type Planned = { templateId: number | null; name: string; exercises: { name: string; video: string | null }[] };
type Mode = 'loading' | 'intro' | 'guided' | 'review' | 'view' | 'edit' | 'done';
type Summary = { name: string; duration: number; rest: number; sets: number };
type Confirm = { title: string; body: string; action: string; onConfirm: () => void };

/**
 * Workout screen.
 * @returns The screen for the current mode
 */
export default function LogScreen() {
  const { date, start } = useLocalSearchParams<{ date: string; start?: string }>();
  const { colors } = useTheme();
  const { weightUnit: unit, restSeconds, defaultSets } = useAppStore();

  const [mode, setMode] = useState<Mode>('loading');
  const [log, setLog] = useState<LogDetail | null>(null);
  const [planned, setPlanned] = useState<Planned | null>(null);
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [chosen, setChosen] = useState<string>('empty');
  const [draft, setDraft] = useState<WorkoutDraft | null>(null);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [skipping, setSkipping] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);
  const isToday = date === toDateStr(new Date());

  /** Loads the log, the planned workout and any saved draft, then picks the mode. */
  const load = async () => {
    try {
      const [detail, schedule, saved, all] = await Promise.all([getLogDetail(date), getSchedule(), getWorkoutDraft(), listTemplates()]);
      setLog(detail);
      setTemplates(all);
      setNotes(detail?.notes ?? '');

      // What this day is: the logged workout if any, otherwise the scheduled one.
      const entry = schedule.find((s) => s.day_of_week === parseISO(date).getDay());
      const templateId = detail ? detail.template_id : entry?.template_id ?? null;
      const template = templateId !== null ? await getTemplate(templateId) : null;
      const name = detail?.template_name ?? template?.name ?? entry?.template_name ?? null;
      setPlanned(name ? { templateId, name, exercises: template?.exercises.map((e) => ({ name: e.name, video: e.video_path })) ?? [] } : null);

      if (saved?.date === date) {
        // Drafts saved before time tracking existed lack these fields.
        setDraft({ ...saved, startedAt: saved.startedAt ?? Date.now(), restMs: saved.restMs ?? 0 });
        setMode('guided');
      } else if (detail?.status === 'completed') {
        setMode('view');
      } else {
        setMode('intro');
        if (start === '1' && isToday && name && detail?.status !== 'skipped' && !saved) begin({ templateId, name, exercises: template?.exercises.map((e) => ({ name: e.name, video: e.video_path })) ?? [] });
      }
    } catch (e) {
      setError(String(e));
      setMode('intro');
    }
  };
  useEffect(() => { load(); }, [date]);

  // Save the workout in progress on every change.
  useEffect(() => {
    if (draft) setWorkoutDraft(draft).catch((e: unknown) => setError(`Couldn't save progress: ${String(e)}`));
  }, [draft]);

  /** Starts the guided workout, warning first if another day's workout is unfinished. */
  const begin = async (p: Planned) => {
    const fresh: WorkoutDraft = { date, templateId: p.templateId, templateName: p.name, exercises: p.exercises.map((e) => ({ name: e.name, video: e.video, sets: [] })), index: 0, startedAt: Date.now(), restMs: 0 };
    const other = await getWorkoutDraft();
    const go = () => { setConfirm(null); setDraft(fresh); setMode('guided'); };
    if (other && other.date !== date) {
      setConfirm({
        title: 'Unfinished workout',
        body: `You have an unfinished ${other.templateName} from ${format(parseISO(other.date), 'EEEE, MMM d')}. Starting this one discards it.`,
        action: 'Discard and start',
        onConfirm: go,
      });
    } else go();
  };

  const startFromIntro = async () => {
    if (planned) return begin(planned);
    // Rest day or unscheduled: use the picked template, or an empty workout.
    const t = chosen === 'empty' ? null : await getTemplate(Number(chosen));
    begin({ templateId: t?.id ?? null, name: t?.name ?? 'Workout', exercises: t?.exercises.map((e) => ({ name: e.name, video: e.video_path })) ?? [] });
  };

  const complete = async (exercises: DraftExercise[], name: string, templateId: number | null) => {
    setSaving(true);
    try {
      // Times come from a live session only; editing a completed workout keeps its original times.
      const timed = mode === 'review' && draft;
      const duration = timed ? Math.round((Date.now() - draft.startedAt) / 1000) : undefined;
      const rest = timed ? Math.min(duration!, Math.round(draft.restMs / 1000)) : undefined;
      await saveCompletedLog({ date, template_id: templateId, template_name: name, notes: notes.trim() || null, exercises, duration_seconds: duration, rest_seconds: rest });
      if (draft) await setWorkoutDraft(null);
      setDraft(null);
      await rescheduleAll(); // drops this day's "you haven't logged" check-in
      if (timed) {
        setSummary({ name, duration: duration!, rest: rest!, sets: exercises.reduce((n, e) => n + e.sets.length, 0) });
        setMode('done');
      } else router.back();
    } catch (e) {
      setError(`Couldn't save the workout: ${String(e)}`);
    } finally {
      setSaving(false);
    }
  };

  const discard = () =>
    setConfirm({
      title: 'Discard this workout?',
      body: 'The sets you logged in this session will be lost.',
      action: 'Discard',
      onConfirm: async () => { setConfirm(null); await setWorkoutDraft(null); setDraft(null); router.back(); },
    });

  const skip = async (reason: string) => {
    if (!planned) return;
    await skipWorkout({ template_id: planned.templateId, template_name: planned.name, date, reason });
    await rescheduleAll();
    setSkipping(false);
    router.back();
  };

  const title = format(parseISO(date), 'EEEE, MMM d');
  let body: React.ReactNode;
  let headerRight: (() => React.ReactNode) | undefined;

  if (mode === 'loading') {
    body = <ActivityIndicator style={{ marginTop: 48 }} />;
  } else if (mode === 'done' && summary) {
    body = (
      <>
        <Text variant="titleLarge" style={{ color: plate.green }}>Workout complete</Text>
        <Text style={[styles.name, { color: colors.onSurface }]}>{summary.name}</Text>
        <Text style={[styles.bigTime, { color: colors.onSurface }]}>{formatDuration(summary.duration)}</Text>
        <Stats duration={summary.duration} rest={summary.rest} sets={summary.sets} />
        <Button mode="contained" onPress={() => router.back()} style={styles.cta} contentStyle={{ paddingVertical: 6 }}>Done</Button>
      </>
    );
  } else if (mode === 'guided' && draft) {
    headerRight = () => <Button onPress={() => setMode('review')}>Finish</Button>;
    body = <Guided draft={draft} setDraft={setDraft} unit={unit} restSeconds={restSeconds} targetSets={defaultSets} onFinish={() => setMode('review')} />;
  } else if ((mode === 'review' && draft) || mode === 'edit') {
    const editing = mode === 'edit';
    const exercises = editing ? log!.exercises : draft!.exercises;
    const setExercises = (ex: DraftExercise[]) => (editing ? setLog({ ...log!, exercises: ex }) : setDraft({ ...draft!, exercises: ex }));
    body = (
      <>
        <Text style={[styles.name, { color: colors.onSurface }]}>{editing ? log!.template_name : draft!.templateName}</Text>
        <LogForm exercises={exercises} onChange={setExercises} notes={notes} onNotesChange={setNotes} unit={unit} />
        <Button mode="contained" icon="check" loading={saving} disabled={saving} style={styles.cta} contentStyle={{ paddingVertical: 6 }}
          onPress={() => complete(exercises, editing ? log!.template_name : draft!.templateName, editing ? log!.template_id : draft!.templateId)}>
          {editing ? 'Save changes' : 'Complete workout'}
        </Button>
        {editing
          ? <Button onPress={load}>Cancel</Button>
          : <>
              <Button onPress={() => setMode('guided')}>Back to workout</Button>
              <Button textColor={colors.error} onPress={discard}>Discard workout</Button>
            </>}
      </>
    );
  } else if (mode === 'view' && log) {
    if (isToday) headerRight = () => <Button onPress={() => setMode('edit')}>Edit</Button>;
    body = (
      <>
        <Text style={[styles.name, { color: colors.onSurface }]}>{log.template_name}</Text>
        <Text variant="labelLarge" style={{ color: plate.green, marginBottom: 12 }}>Completed</Text>
        {log.duration_seconds !== null && (
          <View style={{ marginBottom: 12 }}>
            <Stats duration={log.duration_seconds} rest={log.rest_seconds ?? 0} sets={log.exercises.reduce((n, e) => n + e.sets.length, 0)} />
          </View>
        )}
        {log.exercises.map((ex, i) => (
          <View key={i} style={[styles.card, { backgroundColor: colors.surface }]}>
            <Text style={[styles.exName, { color: colors.onSurface }]}>{ex.name}</Text>
            {ex.sets.map((s, j) => (
              <Text key={j} variant="bodyLarge" style={{ color: colors.onSurfaceVariant }}>Set {j + 1}   {formatSet(s, unit)}</Text>
            ))}
          </View>
        ))}
        {log.exercises.length === 0 && <Text style={{ color: colors.onSurfaceVariant }}>No sets were logged.</Text>}
        {log.notes && <Text variant="bodyLarge" style={{ marginTop: 12 }}>{log.notes}</Text>}
      </>
    );
  } else {
    body = (
      <Intro
        log={log} planned={planned} templates={templates} chosen={chosen} setChosen={setChosen}
        notes={notes} setNotes={setNotes}
        onSaveNotes={() => log && updateLogNotes(log.id, notes.trim() || null).catch((e: unknown) => setError(String(e)))}
        onStart={isToday ? startFromIntro : undefined}
        onSkip={isToday && planned && !log ? () => setSkipping(true) : undefined}
        date={date}
      />
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={100}>
      <Stack.Screen options={{ title, headerRight }} />
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        {error && <HelperText type="error">{error}</HelperText>}
        {body}
      </ScrollView>

      <ReasonDialog visible={skipping} title={`Why skip ${planned?.name ?? 'this workout'}?`} body="Skipping with a reason won't count against you."
        presets={SKIP_REASONS} confirmLabel="Skip workout" onConfirm={skip} onDismiss={() => setSkipping(false)} />
      <Portal>
        <Dialog visible={!!confirm} onDismiss={() => setConfirm(null)}>
          <Dialog.Title>{confirm?.title}</Dialog.Title>
          <Dialog.Content><Text>{confirm?.body}</Text></Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setConfirm(null)}>Cancel</Button>
            <Button textColor={colors.error} onPress={confirm?.onConfirm}>{confirm?.action}</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </KeyboardAvoidingView>
  );
}

type IntroProps = {
  log: LogDetail | null;
  planned: Planned | null;
  templates: TemplateSummary[];
  chosen: string;
  setChosen: (v: string) => void;
  notes: string;
  setNotes: (v: string) => void;
  onSaveNotes: () => void;
  /** Absent when the date isn't today: logging is only allowed on the day. */
  onStart?: () => void;
  onSkip?: () => void;
  date: string;
};

/**
 * Before a workout starts: the plan, or a template picker on a rest day,
 * plus the skipped/missed state with "Log it anyway".
 * @param props - Day info and handlers
 * @returns Intro content
 */
function Intro({ log, planned, templates, chosen, setChosen, notes, setNotes, onSaveNotes, onStart, onSkip, date }: IntroProps) {
  const { colors } = useTheme();
  const muted = { color: colors.onSurfaceVariant };
  const late = log?.status === 'skipped' || log?.status === 'missed';

  return (
    <>
      <Text style={[styles.name, { color: colors.onSurface }, log?.status === 'skipped' && styles.strike]}>{planned?.name ?? 'Rest day'}</Text>

      {log?.status === 'skipped' && (
        <>
          <Text variant="bodyLarge" style={muted}>You skipped this workout.</Text>
          <TextInput mode="outlined" label="Reason" value={notes} onChangeText={setNotes} onEndEditing={onSaveNotes} editable={!!onStart} style={{ marginTop: 12 }} />
        </>
      )}
      {log?.status === 'missed' && <Text variant="bodyLarge" style={muted}>{log.excused ? 'Missed during a break you explained.' : 'This workout was missed.'}</Text>}

      {planned ? (
        <Text variant="bodyLarge" style={[muted, { marginTop: 12 }]}>
          {planned.exercises.length ? planned.exercises.map((e) => e.name).join(', ') : 'No exercises in this workout yet. You can add them as you go.'}
        </Text>
      ) : !onStart ? null : (
        <>
          <Text variant="bodyLarge" style={[muted, { marginBottom: 8 }]}>Nothing scheduled. Pick a workout to log.</Text>
          <RadioButton.Group value={chosen} onValueChange={setChosen}>
            {templates.map((t) => <RadioButton.Item key={t.id} label={t.name} value={String(t.id)} />)}
            <RadioButton.Item label="Empty workout" value="empty" />
          </RadioButton.Group>
        </>
      )}

      {onStart ? (
        <Button mode="contained" icon={late ? 'check' : 'play'} onPress={onStart} style={styles.cta} contentStyle={{ paddingVertical: 6 }}>
          {late ? 'Log it anyway' : 'Start workout'}
        </Button>
      ) : (
        <Text variant="bodyMedium" style={[muted, { marginTop: 20 }]}>
          {date > toDateStr(new Date())
            ? `You can log this on ${format(parseISO(date), 'EEEE')}.`
            : 'Workouts can only be logged on the day.'}
        </Text>
      )}
      {onSkip && <Button onPress={onSkip} style={{ alignSelf: 'flex-start', marginTop: 4 }}>Skip workout</Button>}
    </>
  );
}

type GuidedProps = {
  draft: WorkoutDraft;
  setDraft: (d: WorkoutDraft) => void;
  unit: string;
  restSeconds: number;
  targetSets: number;
  onFinish: () => void;
};

/**
 * One exercise at a time: logged sets, the next set's inputs, the sets-left
 * counter, Rest (logs the set and starts the timer) and Next exercise.
 * @param props - Draft, setters and settings
 * @returns Guided workout content
 */
function Guided({ draft, setDraft, unit, restSeconds, targetSets, onFinish }: GuidedProps) {
  const { colors } = useTheme();
  const [resting, setResting] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const ex: DraftExercise | undefined = draft.exercises[draft.index];
  const last = draft.index >= draft.exercises.length - 1;
  // The next set starts as a copy of the exercise's previous set, since most sets repeat.
  const lastSetOf = (e?: DraftExercise): LoggedSet => e?.sets[e.sets.length - 1] ?? { reps: null, weight: null };
  const [pending, setPending] = useState<LoggedSet>(lastSetOf(ex));

  const setExercise = (fn: (e: DraftExercise) => DraftExercise) =>
    setDraft({ ...draft, exercises: draft.exercises.map((e, i) => (i === draft.index ? fn(e) : e)) });
  // Logging keeps pending as-is, so the next set is pre-filled with the same numbers.
  const logSet = () => setExercise((e) => ({ ...e, sets: [...e.sets, pending] }));
  // Reset pending in the same update as the switch, so the inputs (seeded on remount) and pending never disagree.
  const goTo = (index: number) => {
    setPending(lastSetOf(draft.exercises[index]));
    setDraft({ ...draft, index });
  };
  const addExercise = () => {
    const name = newName.trim();
    if (!name) return;
    const exercises = [...draft.exercises];
    exercises.splice(draft.index + 1, 0, { name, sets: [] });
    setPending({ reps: null, weight: null });
    setDraft({ ...draft, exercises, index: ex ? draft.index + 1 : 0 });
    setNewName('');
    setAdding(false);
  };

  const addDialog = (
    <Portal>
      <Dialog visible={adding} onDismiss={() => setAdding(false)}>
        <Dialog.Title>Add exercise</Dialog.Title>
        <Dialog.Content>
          <TextInput mode="outlined" label="Exercise name" value={newName} onChangeText={setNewName} autoFocus onSubmitEditing={addExercise} />
        </Dialog.Content>
        <Dialog.Actions>
          <Button onPress={() => setAdding(false)}>Cancel</Button>
          <Button onPress={addExercise} disabled={!newName.trim()}>Add</Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );

  if (!ex) {
    return (
      <>
        <Text style={[styles.name, { color: colors.onSurface }]}>{draft.templateName}</Text>
        <Text variant="bodyLarge" style={{ color: colors.onSurfaceVariant }}>No exercises yet. Add the first one to start.</Text>
        <Button mode="contained" icon="plus" onPress={() => setAdding(true)} style={styles.cta}>Add exercise</Button>
        {addDialog}
      </>
    );
  }

  return (
    <>
      <View style={styles.navRow}>
        <IconButton icon="chevron-left" disabled={draft.index === 0} onPress={() => goTo(draft.index - 1)} accessibilityLabel="Previous exercise" />
        <Text variant="labelLarge" style={{ color: colors.onSurfaceVariant }}>Exercise {draft.index + 1} of {draft.exercises.length}</Text>
        <IconButton icon="chevron-right" disabled={last} onPress={() => goTo(draft.index + 1)} accessibilityLabel="Next exercise without logging" />
      </View>

      <View style={[styles.exCard, { backgroundColor: colors.surface, borderLeftColor: plate.blue }]}>
        <Text style={[styles.name, { color: colors.onSurface }]}>{ex.name}</Text>
        {ex.video && <ExerciseVideo key={ex.video} path={ex.video} height={190} />}

        {ex.sets.map((s, i) => (
          <View key={i} style={styles.doneRow}>
            <Text variant="bodyLarge" style={{ color: colors.onSurfaceVariant, flex: 1 }}>Set {i + 1}   {formatSet(s, unit)}</Text>
            <IconButton icon="close" size={18} onPress={() => setExercise((e) => ({ ...e, sets: e.sets.filter((_, k) => k !== i) }))} accessibilityLabel={`Remove set ${i + 1}`} />
          </View>
        ))}

        <View style={styles.setRow}>
          <Text variant="labelLarge" style={{ width: 44 }}>Set {ex.sets.length + 1}</Text>
          <NumberField key={`r${draft.index}-${ex.sets.length}`} integer label="Reps" value={pending.reps} onChange={(reps) => setPending((p) => ({ ...p, reps }))} style={{ flex: 1 }} />
          <NumberField key={`w${draft.index}-${ex.sets.length}`} label="Weight" suffix={unit} value={pending.weight} onChange={(weight) => setPending((p) => ({ ...p, weight }))} style={{ flex: 1.3 }} />
          <IconButton icon="check" mode="outlined" onPress={logSet} accessibilityLabel="Log set without resting" />
        </View>

        <Text style={[styles.counter, { color: ex.sets.length >= targetSets ? plate.green : colors.primary }]}>{setsLeftLabel(ex.sets.length, targetSets)}</Text>
      </View>

      <Button mode="contained" icon="timer-outline" onPress={() => { logSet(); setResting(true); }} style={styles.cta} contentStyle={{ paddingVertical: 10 }} labelStyle={{ fontSize: 18 }}>
        Rest  {formatClock(restSeconds)}
      </Button>
      <Button mode="outlined" icon={last ? 'flag-checkered' : 'arrow-right'} onPress={last ? onFinish : () => goTo(draft.index + 1)} style={{ marginTop: 10 }} contentStyle={{ paddingVertical: 6 }}>
        {last ? 'Finish workout' : 'Next exercise'}
      </Button>
      <Button icon="plus" onPress={() => setAdding(true)} style={{ alignSelf: 'flex-start', marginTop: 8 }}>Add exercise</Button>

      {resting && <RestTimer seconds={restSeconds} onFinish={(ms) => { setResting(false); setDraft({ ...draft, restMs: draft.restMs + ms }); }} />}
      {addDialog}
    </>
  );
}

/**
 * Total, active and rest time plus set count for a finished workout.
 * @param props - Durations in seconds and number of sets
 * @returns A row of stats
 */
function Stats({ duration, rest, sets }: { duration: number; rest: number; sets: number }) {
  const { colors } = useTheme();
  const items = [
    ['Total', formatDuration(duration)],
    ['Active', formatDuration(Math.max(0, duration - rest))],
    ['Resting', formatDuration(rest)],
    ['Sets', String(sets)],
  ];
  return (
    <View style={styles.stats}>
      {items.map(([label, value]) => (
        <View key={label} style={[styles.stat, { backgroundColor: colors.surface }]}>
          <Text style={[styles.statValue, { color: colors.onSurface }]}>{value}</Text>
          <Text variant="labelMedium" style={{ color: colors.onSurfaceVariant }}>{label}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, paddingBottom: 48 },
  name: { fontFamily: FONT.display, fontSize: 36, lineHeight: 40, marginBottom: 4 },
  strike: { textDecorationLine: 'line-through' },
  cta: { marginTop: 20 },
  card: { padding: 12, borderRadius: 8, marginBottom: 10, gap: 2 },
  exName: { fontFamily: FONT.title, fontSize: 20 },
  navRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  exCard: { padding: 16, borderRadius: 8, borderLeftWidth: 8, gap: 6 },
  doneRow: { flexDirection: 'row', alignItems: 'center' },
  setRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  counter: { fontFamily: FONT.title, fontSize: 24, marginTop: 12 },
  bigTime: { fontFamily: FONT.display, fontSize: 72, lineHeight: 78, marginVertical: 8 },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  stat: { flexGrow: 1, flexBasis: '45%', padding: 12, borderRadius: 8 },
  statValue: { fontFamily: FONT.title, fontSize: 22 },
});
