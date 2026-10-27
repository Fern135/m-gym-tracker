/**
 * @file template/[id].tsx
 * @description Create (id = "new") or edit a workout template: name, notes,
 * and an exercise list you can add to, rename, remove from and drag to reorder.
 * Each exercise can have one how-to video, recorded, picked, or found via a YouTube search. Video files are only deleted once the
 * change is saved; clips recorded but never saved are cleaned up on leaving.
 */
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Linking, Platform, Pressable, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Button, Dialog, HelperText, IconButton, List, Portal, Text, TextInput, useTheme } from 'react-native-paper';
import { LinearTransition } from 'react-native-reanimated';
import ReorderableList, { reorderItems, useReorderableDrag } from 'react-native-reorderable-list';
import { EmptyState } from '../../../components/EmptyState';
import { ExerciseVideo } from '../../../components/ExerciseVideo';
import { deleteTemplate, getScheduledDaysForTemplate, getTemplate, saveTemplate } from '../../../lib/db';
import { DAY_NAMES } from '../../../lib/days';
import { checkInternet, deleteMediaFile, importVideo, MAX_VIDEO_SECONDS, pickVideo } from '../../../lib/media';
import { rescheduleAll } from '../../../lib/notifications';

type Row = { key: string; name: string; video: string | null };

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
  const [videoFor, setVideoFor] = useState<string | null>(null);
  const [videoBusy, setVideoBusy] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [netBad, setNetBad] = useState(false);
  const [netHelp, setNetHelp] = useState(false);
  const nextKey = useRef(0);
  const newKey = () => `k${nextKey.current++}`;
  // Video files known to this screen: the ones already saved, and the ones recorded here.
  const savedVideos = useRef(new Set<string>());
  const newVideos = useRef(new Set<string>());
  const done = useRef(false);

  // Leaving without saving: delete clips recorded on this visit so they don't pile up.
  useEffect(() => () => {
    if (!done.current) newVideos.current.forEach(deleteMediaFile);
  }, []);

  useEffect(() => {
    if (id === undefined) return;
    getTemplate(id)
      .then((t) => {
        if (!t) return setMissing(true);
        setName(t.name);
        setNotes(t.notes ?? '');
        setRows(t.exercises.map((e) => ({ key: newKey(), name: e.name, video: e.video_path })));
        t.exercises.forEach((e) => e.video_path && savedVideos.current.add(e.video_path));
      })
      .catch((e: unknown) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [id]);

  const addExercise = () => {
    const n = draft.trim();
    if (!n) return;
    setRows((r) => [...r, { key: newKey(), name: n, video: null }]);
    setDraft('');
  };
  const renameRow = useCallback((key: string, n: string) => setRows((r) => r.map((x) => (x.key === key ? { ...x, name: n } : x))), []);
  const removeRow = useCallback((key: string) => setRows((r) => r.filter((x) => x.key !== key)), []);
  const openVideo = useCallback((key: string) => {
    setVideoError(null);
    setVideoFor(key);
    checkInternet().then((s) => setNetBad(s === 'bad'));
  }, []);

  /** Records or picks a clip, copies it into the app, and sets it on the row (replacing any old one). */
  const chooseVideo = async (source: 'camera' | 'library') => {
    const key = videoFor;
    setVideoBusy(true);
    setVideoError(null);
    try {
      const uri = await pickVideo(source);
      if (!uri || !key) return;
      const path = await importVideo(uri);
      newVideos.current.add(path);
      setRows((r) => r.map((x) => (x.key === key ? { ...x, video: path } : x)));
    } catch (e) {
      setVideoError(e instanceof Error ? e.message : String(e));
    } finally {
      setVideoBusy(false);
    }
  };
  /** Opens a YouTube search for the exercise (app if installed, else browser). Needs internet; nothing is saved. */
  const searchOnline = () => {
    const q = encodeURIComponent(`${rows.find((r) => r.key === videoFor)?.name.trim() || 'exercise'} how to proper form`);
    Linking.openURL(`https://www.youtube.com/results?search_query=${q}`).catch(() => setVideoError("Couldn't open the browser."));
  };
  const removeVideo = () => {
    setRows((r) => r.map((x) => (x.key === videoFor ? { ...x, video: null } : x)));
    setVideoFor(null);
  };

  /**
   * After a successful save, deletes every file this screen knew about that the saved plan no longer uses.
   * @param kept - Video paths still referenced
   */
  const dropUnusedVideos = (kept: Set<string>) => {
    for (const p of [...savedVideos.current, ...newVideos.current]) if (!kept.has(p)) deleteMediaFile(p);
  };

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed) return setNameError(true);
    setSaving(true);
    try {
      const exercises = rows.filter((r) => r.name.trim()).map((r) => ({ name: r.name.trim(), video_path: r.video }));
      if (draft.trim()) exercises.push({ name: draft.trim(), video_path: null }); // don't lose a typed-but-not-added exercise
      await saveTemplate({ id, name: trimmed, notes: notes.trim() || null, exercises });
      done.current = true;
      dropUnusedVideos(new Set(exercises.map((e) => e.video_path).filter((p): p is string => !!p)));
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
      done.current = true;
      dropUnusedVideos(new Set());
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
        renderItem={({ item }) => <ExerciseRow row={item} onRename={renameRow} onRemove={removeRow} onVideo={openVideo} />}
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
        <Dialog visible={videoFor !== null} onDismiss={() => !videoBusy && setVideoFor(null)}>
          <Dialog.Title>{rows.find((r) => r.key === videoFor)?.name || 'Exercise'} video</Dialog.Title>
          <Dialog.Content style={{ gap: 8 }}>
            {(() => {
              const video = rows.find((r) => r.key === videoFor)?.video;
              return video
                ? <ExerciseVideo key={video} path={video} height={220} expandable={false} />
                : <Text>Add a clip showing how to do this exercise, up to {MAX_VIDEO_SECONDS} seconds. It plays on a silent loop during your workout.</Text>;
            })()}
            {videoError && <HelperText type="error">{videoError}</HelperText>}
            <Button icon="video-outline" mode="outlined" onPress={() => chooseVideo('camera')} disabled={videoBusy} loading={videoBusy}>Record video</Button>
            <Button icon="folder-play-outline" mode="outlined" onPress={() => chooseVideo('library')} disabled={videoBusy}>Choose from library</Button>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Button
                icon="youtube"
                mode="outlined"
                onPress={searchOnline}
                disabled={videoBusy}
                style={[{ flex: 1 }, netBad && { borderColor: colors.error }]}
                textColor={netBad ? colors.error : undefined}
              >
                Search online
              </Button>
              {netBad && (
                <IconButton icon="help-circle-outline" iconColor={colors.error} onPress={() => setNetHelp(true)} accessibilityLabel="Why is Search online red?" />
              )}
            </View>
            {rows.find((r) => r.key === videoFor)?.video && (
              <Button icon="delete-outline" textColor={colors.error} onPress={removeVideo} disabled={videoBusy}>Remove video</Button>
            )}
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setVideoFor(null)} disabled={videoBusy}>Done</Button>
          </Dialog.Actions>
        </Dialog>
        <Dialog visible={netHelp} onDismiss={() => setNetHelp(false)}>
          <Dialog.Title>No internet or slow connection</Dialog.Title>
          <Dialog.Content>
            <Text>Your internet is slow or not available right now, so searching for a video online may not work. You can still record a video or choose one from your phone.</Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setNetHelp(false)}>OK</Button>
          </Dialog.Actions>
        </Dialog>
        <Dialog visible={deleteDays !== null} onDismiss={() => setDeleteDays(null)}>
          <Dialog.Title>Delete {name.trim() || 'this workout'}?</Dialog.Title>
          <Dialog.Content>
            {deleteDays && deleteDays.length > 0 && (
              <Text style={{ marginBottom: 8 }}>
                It&apos;s on your schedule for {deleteDays.map((d) => DAY_NAMES[d]).join(', ')}. Those days will become rest days.
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

type RowProps = {
  row: Row;
  onRename: (key: string, name: string) => void;
  onRemove: (key: string) => void;
  onVideo: (key: string) => void;
};

/**
 * One exercise row: drag handle, editable name, video button, remove button.
 * @param props - The row and its change handlers
 * @returns The row
 */
const ExerciseRow = memo(function ExerciseRow({ row, onRename, onRemove, onVideo }: RowProps) {
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
      <IconButton
        icon={row.video ? 'play-box' : 'video-plus-outline'}
        iconColor={row.video ? colors.primary : colors.onSurfaceVariant}
        onPress={() => onVideo(row.key)}
        accessibilityLabel={row.video ? `${row.name} video. Tap to view or change.` : `Add a video for ${row.name}`}
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
