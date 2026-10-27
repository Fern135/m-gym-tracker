/**
 * @file template/[id].tsx
 * @description Create (id = "new") or edit a workout template: name, notes,
 * and an exercise list you can add to, rename, remove from and drag to reorder.
 */
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Button, Dialog, HelperText, IconButton, List, Portal, Text, TextInput, useTheme } from 'react-native-paper';
import { LinearTransition } from 'react-native-reanimated';
import ReorderableList, { reorderItems, useReorderableDrag } from 'react-native-reorderable-list';
import { EmptyState } from '../../../components/EmptyState';
import { deleteTemplate, getScheduledDaysForTemplate, getTemplate, saveTemplate } from '../../../lib/db';
import { DAY_NAMES } from '../../../lib/days';
import { rescheduleAll } from '../../../lib/notifications';

type Row = { key: string; name: string };

/**
 * Template editor screen.
 * @returns The editor, a loading spinner, or a not-found message
 */
export default function TemplateEditor() {
  const { id: idParam } = useLocalSearchParams<{ id: string }>();
  const id = idParam === 'new' ? undefined : Number(idParam);
  const { colors } = useTheme();

  const [loading, setLoading] = useState(id !== undefined);
  const [missing, setMissing] = useState(false);
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [draft, setDraft] = useState('');
  const [nameError, setNameError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteDays, setDeleteDays] = useState<number[] | null>(null);
  const nextKey = useRef(0);
  const newKey = () => `k${nextKey.current++}`;

  useEffect(() => {
    if (id === undefined) return;
    getTemplate(id)
      .then((t) => {
        if (!t) return setMissing(true);
        setName(t.name);
        setNotes(t.notes ?? '');
        setRows(t.exercises.map((e) => ({ key: newKey(), name: e.name })));
      })
      .catch((e: unknown) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [id]);

  const addExercise = () => {
    const n = draft.trim();
    if (!n) return;
    setRows((r) => [...r, { key: newKey(), name: n }]);
    setDraft('');
  };
  const renameRow = useCallback((key: string, n: string) => setRows((r) => r.map((x) => (x.key === key ? { ...x, name: n } : x))), []);
  const removeRow = useCallback((key: string) => setRows((r) => r.filter((x) => x.key !== key)), []);

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed) return setNameError(true);
    setSaving(true);
    try {
      const exercises = rows.map((r) => r.name.trim()).filter(Boolean);
      if (draft.trim()) exercises.push(draft.trim()); // don't lose a typed-but-not-added exercise
      await saveTemplate({ id, name: trimmed, notes: notes.trim() || null, exercises });
      await rescheduleAll(); // notification text includes the workout name
      router.back();
    } catch (e) {
      setError(String(e));
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (id === undefined) return;
    setDeleteDays(await getScheduledDaysForTemplate(id).catch(() => []));
  };
  const doDelete = async () => {
    if (id === undefined) return;
    try {
      await deleteTemplate(id);
      await rescheduleAll(); // its schedule entries were removed with it
      setDeleteDays(null);
      router.back();
    } catch (e) {
      setDeleteDays(null);
      setError(String(e));
    }
  };

  const title = id === undefined ? 'New workout' : 'Edit workout';
  const header = (
    <Stack.Screen
      options={{
        title,
        headerRight: () => (
          <Button onPress={save} loading={saving} disabled={saving || loading || missing}>
            Save
          </Button>
        ),
      }}
    />
  );

  if (loading) return <>{header}<ActivityIndicator style={{ flex: 1, backgroundColor: colors.background }} /></>;
  if (missing)
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        {header}
        <EmptyState icon="dumbbell" title="This workout no longer exists" body="It may have been deleted. Go back to see your workouts." />
      </View>
    );

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={100}>
      {header}
      <ReorderableList
        data={rows}
        keyExtractor={(r) => r.key}
        onReorder={({ from, to }) => setRows((r) => reorderItems(r, from, to))}
        itemLayoutAnimation={LinearTransition}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 48 }}
        renderItem={({ item }) => <ExerciseRow row={item} onRename={renameRow} onRemove={removeRow} />}
        ListHeaderComponent={
          <View style={styles.pad}>
            {error && <HelperText type="error">{error}</HelperText>}
            <TextInput
              label="Workout name"
              value={name}
              onChangeText={(t) => { setName(t); setNameError(false); }}
              error={nameError}
              autoFocus={id === undefined}
              placeholder="Upper Body"
            />
            <HelperText type="error" visible={nameError}>Give this workout a name.</HelperText>
            <TextInput label="Notes (optional)" value={notes} onChangeText={setNotes} multiline />
            <List.Subheader style={styles.sub}>Exercises</List.Subheader>
          </View>
        }
        ListFooterComponent={
          <View style={styles.pad}>
            <View style={styles.addRow}>
              <TextInput
                style={{ flex: 1 }}
                mode="outlined"
                placeholder="Add an exercise, e.g. Bench Press"
                value={draft}
                onChangeText={setDraft}
                onSubmitEditing={addExercise}
                submitBehavior="submit"
                returnKeyType="done"
              />
              <IconButton icon="plus" mode="contained" onPress={addExercise} disabled={!draft.trim()} accessibilityLabel="Add exercise" />
            </View>
            {id !== undefined && (
              <Button icon="delete-outline" textColor={colors.error} onPress={confirmDelete} style={{ marginTop: 32, alignSelf: 'flex-start' }}>
                Delete workout
              </Button>
            )}
          </View>
        }
      />

      <Portal>
        <Dialog visible={deleteDays !== null} onDismiss={() => setDeleteDays(null)}>
          <Dialog.Title>Delete {name.trim() || 'this workout'}?</Dialog.Title>
          <Dialog.Content>
            {deleteDays && deleteDays.length > 0 && (
              <Text style={{ marginBottom: 8 }}>
                It's on your schedule for {deleteDays.map((d) => DAY_NAMES[d]).join(', ')}. Those days will become rest days.
              </Text>
            )}
            <Text>Workouts you already logged stay in your history.</Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setDeleteDays(null)}>Cancel</Button>
            <Button textColor={colors.error} onPress={doDelete}>Delete</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </KeyboardAvoidingView>
  );
}

type RowProps = { row: Row; onRename: (key: string, name: string) => void; onRemove: (key: string) => void };

/**
 * One exercise row: drag handle, editable name, remove button.
 * @param props - The row and its change handlers
 * @returns The row
 */
const ExerciseRow = memo(function ExerciseRow({ row, onRename, onRemove }: RowProps) {
  const drag = useReorderableDrag();
  const { colors } = useTheme();
  return (
    <View style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.outlineVariant }]}>
      <Pressable onPressIn={drag} hitSlop={8} accessibilityLabel={`Reorder ${row.name}`} accessibilityRole="button" style={styles.handle}>
        <MaterialCommunityIcons name="drag-horizontal-variant" size={24} color={colors.onSurfaceVariant} />
      </Pressable>
      <TextInput
        dense
        style={{ flex: 1, backgroundColor: 'transparent' }}
        underlineColor="transparent"
        value={row.name}
        onChangeText={(t) => onRename(row.key, t)}
        accessibilityLabel="Exercise name"
      />
      <IconButton icon="close" onPress={() => onRemove(row.key)} accessibilityLabel={`Remove ${row.name}`} />
    </View>
  );
});

const styles = StyleSheet.create({
  pad: { paddingHorizontal: 16, paddingTop: 12 },
  sub: { paddingHorizontal: 0, marginTop: 8 },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  row: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginBottom: 6, borderRadius: 6, borderWidth: StyleSheet.hairlineWidth },
  handle: { paddingHorizontal: 12, paddingVertical: 14 },
});
