/**
 * @file LogForm.tsx
 * @description Editable list of exercises and their sets plus notes. Used to
 * review a workout before completing it and to edit a completed one.
 */
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, IconButton, Text, TextInput, useTheme } from 'react-native-paper';
import { FONT } from '../lib/theme';
import type { DraftExercise } from '../lib/workout';
import { NumberField } from './NumberField';

type Props = {
  exercises: DraftExercise[];
  onChange: (exercises: DraftExercise[]) => void;
  notes: string;
  onNotesChange: (notes: string) => void;
  unit: string;
};

/**
 * Exercises + sets + notes editor.
 * @param props - Current values, change handlers and the weight unit label
 * @returns The form
 */
export function LogForm({ exercises, onChange, notes, onNotesChange, unit }: Props) {
  const { colors } = useTheme();
  const [newName, setNewName] = useState('');

  const update = (i: number, fn: (ex: DraftExercise) => DraftExercise) => onChange(exercises.map((ex, j) => (j === i ? fn(ex) : ex)));
  const addExercise = () => {
    const name = newName.trim();
    if (!name) return;
    onChange([...exercises, { name, sets: [] }]);
    setNewName('');
  };

  return (
    <View style={{ gap: 16 }}>
      {exercises.map((ex, i) => (
        // Index keys are fine here: rows are only appended or removed, and NumberField reseeds via its own key.
        <View key={`${i}-${ex.name}`} style={[styles.card, { backgroundColor: colors.surface }]}>
          <View style={styles.headRow}>
            <Text style={[styles.exName, { color: colors.onSurface }]}>{ex.name}</Text>
            <IconButton icon="delete-outline" size={20} onPress={() => onChange(exercises.filter((_, j) => j !== i))} accessibilityLabel={`Remove ${ex.name}`} />
          </View>
          {ex.sets.length === 0 && <Text variant="bodySmall" style={{ color: colors.onSurfaceVariant }}>No sets logged.</Text>}
          {ex.sets.map((set, s) => (
            <View key={`${s}-${ex.sets.length}`} style={styles.setRow}>
              <Text variant="labelLarge" style={styles.setNo}>Set {s + 1}</Text>
              <NumberField dense integer label="Reps" value={set.reps} style={styles.field}
                onChange={(reps) => update(i, (e) => ({ ...e, sets: e.sets.map((x, k) => (k === s ? { ...x, reps } : x)) }))} />
              <NumberField dense label="Weight" suffix={unit} value={set.weight} style={styles.field}
                onChange={(weight) => update(i, (e) => ({ ...e, sets: e.sets.map((x, k) => (k === s ? { ...x, weight } : x)) }))} />
              <IconButton icon="close" size={18} onPress={() => update(i, (e) => ({ ...e, sets: e.sets.filter((_, k) => k !== s) }))} accessibilityLabel={`Remove set ${s + 1}`} />
            </View>
          ))}
          <Button icon="plus" compact style={{ alignSelf: 'flex-start' }}
            onPress={() => update(i, (e) => ({ ...e, sets: [...e.sets, e.sets[e.sets.length - 1] ?? { reps: null, weight: null }] }))}>
            Add set
          </Button>
        </View>
      ))}

      <View style={styles.addRow}>
        <TextInput mode="outlined" style={{ flex: 1 }} placeholder="Add an exercise" value={newName} onChangeText={setNewName} onSubmitEditing={addExercise} />
        <IconButton icon="plus" mode="contained" onPress={addExercise} disabled={!newName.trim()} accessibilityLabel="Add exercise" />
      </View>

      <TextInput mode="outlined" label="Notes" value={notes} onChangeText={onNotesChange} multiline style={{ minHeight: 88 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: 12, borderRadius: 8, gap: 6 },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  exName: { fontFamily: FONT.title, fontSize: 20, flex: 1 },
  setRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  setNo: { width: 44 },
  field: { flex: 1 },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
