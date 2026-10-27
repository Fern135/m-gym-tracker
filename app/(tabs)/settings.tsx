/**
 * @file settings.tsx
 * @description All app settings: workout (unit, week start, rest, sets),
 * notifications (master switch, workout time, which reminders, permission help),
 * appearance, and data (export, clear logs, clear everything).
 * Every notification change reschedules the reminders right away.
 */
import { format, set } from 'date-fns';
import { useCallback, useEffect, useState } from 'react';
import { AppState, Linking, Platform, ScrollView, View } from 'react-native';
import { Button, Checkbox, Dialog, HelperText, IconButton, List, Portal, SegmentedButtons, Snackbar, Surface, Switch, Text, useTheme } from 'react-native-paper';
import { clearEverything, clearLogs } from '../../lib/db';
import { exportLogs } from '../../lib/export';
import { deleteAllMedia } from '../../lib/media';
import { allowExactAlarms, exactAlarmsAllowed, getPermission, requestPermission, rescheduleAll } from '../../lib/notifications';
import {
  getLeadTimes, getNotificationsEnabled, getWorkoutTime, setLeadTimes, setNotificationsEnabled, setWorkoutDraft, setWorkoutTime,
  type LeadTime, type ThemeSetting,
} from '../../lib/settings';
import { useAppStore } from '../../lib/store';
import { formatClock } from '../../lib/workout';

/** The "Notify me" checklist, in the order the reminders arrive. */
const LEAD_OPTIONS: { value: LeadTime; label: string }[] = [
  { value: 'day_before', label: 'Evening before (8:00 PM)' },
  { value: '1_hour', label: '1 hour before' },
  { value: '30_min', label: '30 minutes before' },
  { value: '15_min', label: '15 minutes before' },
  { value: 'at_time', label: 'At workout time' },
  { value: 'evening_checkin', label: "9:00 PM if I haven't logged it" },
];

type Notif = { enabled: boolean; time: { hour: number; minute: number }; leads: LeadTime[] };
type Confirm = { title: string; body: string; action: string; run: () => Promise<string> };

/**
 * Reads the notification settings shown on this screen.
 * @returns Master switch, workout time and enabled reminders
 */
async function readNotif(): Promise<Notif> {
  const [enabled, time, leads] = await Promise.all([getNotificationsEnabled(), getWorkoutTime(), getLeadTimes()]);
  return { enabled, time, leads };
}

/**
 * @returns The settings screen
 */
export default function SettingsScreen() {
  const { colors, fonts } = useTheme();
  const { weightUnit, theme, firstDayOfWeek, restSeconds, defaultSets, setWeightUnit, setTheme, setFirstDayOfWeek, setRestSeconds, setDefaultSets, hydrate } = useAppStore();
  const [notif, setNotif] = useState<Notif | null>(null);
  const [perm, setPerm] = useState<{ granted: boolean; canAskAgain: boolean } | null>(null);
  const [exactOk, setExactOk] = useState<boolean | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  /** Permissions can change in the device's Settings app, so re-check whenever the app comes back. */
  const loadPerms = useCallback(() => {
    getPermission().then(setPerm);
    exactAlarmsAllowed().then(setExactOk);
  }, []);

  useEffect(() => {
    readNotif().then(setNotif);
    loadPerms();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') { loadPerms(); rescheduleAll(); } // permission may have just been granted
    });
    return () => sub.remove();
  }, [loadPerms]);

  /** Saves the changed notification settings, then reschedules. */
  const updateNotif = async (next: Notif) => {
    setNotif(next);
    try {
      await Promise.all([setNotificationsEnabled(next.enabled), setWorkoutTime(next.time), setLeadTimes(next.leads)]);
    } catch (e) {
      showSaveError(e);
      setNotif(await readNotif().catch(() => notif)); // show what's actually stored
    }
    await rescheduleAll();
  };
  /** Shows a failed settings save instead of dropping it silently. */
  const showSaveError = (e: unknown) => setMessage(`Couldn't save: ${e instanceof Error ? e.message : String(e)}`);
  /** Runs a store setter, reporting failure. */
  const save = (p: Promise<void>) => { p.catch(showSaveError); };
  /** Moves the workout time by 15 minutes, wrapping around midnight. */
  const shiftTime = (minutes: number) => {
    if (!notif) return;
    const total = (notif.time.hour * 60 + notif.time.minute + minutes + 1440) % 1440;
    updateNotif({ ...notif, time: { hour: Math.floor(total / 60), minute: total % 60 } });
  };
  const toggleLead = (lead: LeadTime) => {
    if (!notif) return;
    const leads = notif.leads.includes(lead) ? notif.leads.filter((l) => l !== lead) : [...notif.leads, lead];
    updateNotif({ ...notif, leads });
  };
  const askPermission = async () => {
    try {
      if (perm?.canAskAgain) await requestPermission();
      else await Linking.openSettings();
    } catch (e) {
      setMessage(`Couldn't open settings: ${e instanceof Error ? e.message : String(e)}`);
    }
    loadPerms();
    rescheduleAll();
  };

  const runConfirmed = async () => {
    if (!confirm) return;
    setBusy(true);
    try {
      setMessage(await confirm.run());
    } catch (e) {
      setMessage(`That didn't work: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };
  const askClearLogs = () =>
    setConfirm({
      title: 'Clear all workout logs?',
      body: 'Every completed, skipped and missed workout, its sets, and your explained breaks will be deleted. Your workouts and schedule stay.',
      action: 'Clear logs',
      run: async () => {
        await clearLogs();
        await setWorkoutDraft(null);
        await rescheduleAll();
        return 'Workout logs cleared';
      },
    });
  const askClearEverything = () =>
    setConfirm({
      title: 'Clear everything?',
      body: 'This will delete all your data including templates and schedule, every exercise video, and your settings. It can’t be undone.',
      action: 'Clear everything',
      run: async () => {
        await clearEverything();
        deleteAllMedia();
        await hydrate();
        setNotif(await readNotif());
        await rescheduleAll();
        return 'Everything cleared';
      },
    });
  const doExport = async () => {
    setBusy(true);
    try {
      await exportLogs();
    } catch (e) {
      setMessage(`Couldn't export: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const off = !notif?.enabled;
  const timeLabel = notif ? format(set(new Date(), { hours: notif.time.hour, minutes: notif.time.minute }), 'h:mm a') : '';

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView contentContainerStyle={{ paddingVertical: 8, paddingBottom: 48 }}>
        <List.Section>
          <List.Subheader>Workout</List.Subheader>
          <View style={{ paddingHorizontal: 16, gap: 4 }}>
            <Text variant="labelLarge">Weight unit</Text>
            <SegmentedButtons
              value={weightUnit}
              onValueChange={(v) => save(setWeightUnit(v === 'kg' ? 'kg' : 'lbs'))}
              buttons={[{ value: 'lbs', label: 'Pounds (lbs)' }, { value: 'kg', label: 'Kilograms (kg)' }]}
            />
            <HelperText type="info" style={{ paddingHorizontal: 0 }}>Changes the label only. Weights you already logged keep their numbers.</HelperText>
            <Text variant="labelLarge">Week starts on</Text>
            <SegmentedButtons
              value={String(firstDayOfWeek)}
              onValueChange={(v) => save(setFirstDayOfWeek(v === '0' ? 0 : 1))}
              buttons={[{ value: '1', label: 'Monday' }, { value: '0', label: 'Sunday' }]}
            />
          </View>
          <List.Item
            title="Rest time"
            description="Length of the rest timer between sets"
            left={(p) => <List.Icon {...p} icon="timer-outline" />}
            right={() => <Stepper label={formatClock(restSeconds)} onMinus={() => save(setRestSeconds(Math.max(15, restSeconds - 15)))} onPlus={() => save(setRestSeconds(Math.min(600, restSeconds + 15)))} what="rest time" />}
          />
          <List.Item
            title="Sets per exercise"
            description="The countdown during a workout starts here"
            left={(p) => <List.Icon {...p} icon="counter" />}
            right={() => <Stepper label={String(defaultSets)} onMinus={() => save(setDefaultSets(Math.max(1, defaultSets - 1)))} onPlus={() => save(setDefaultSets(Math.min(10, defaultSets + 1)))} what="sets per exercise" />}
          />
        </List.Section>

        <List.Section>
          <List.Subheader>Notifications</List.Subheader>
          {perm && !perm.granted && (
            <Surface elevation={0} style={{ marginHorizontal: 16, marginBottom: 8, padding: 12, borderRadius: 8, borderWidth: 1, borderColor: colors.error, gap: 8 }}>
              <Text>
                Notifications are disabled. Go to your device Settings &gt; Ironweek &gt; Notifications to enable them. The app works fine without them.
              </Text>
              <Button mode="outlined" textColor={colors.error} style={{ alignSelf: 'flex-start', borderColor: colors.error }} onPress={askPermission}>
                {perm.canAskAgain ? 'Allow notifications' : 'Open device settings'}
              </Button>
            </Surface>
          )}
          <List.Item
            title="Workout reminders"
            description="Only on days with a scheduled workout"
            left={(p) => <List.Icon {...p} icon="bell-outline" />}
            right={() => <Switch value={!!notif?.enabled} disabled={!notif} onValueChange={(enabled) => { if (notif) updateNotif({ ...notif, enabled }); }} />}
            onPress={() => notif && updateNotif({ ...notif, enabled: !notif.enabled })}
          />
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 4, opacity: off ? 0.45 : 1 }}>
            <View style={{ flex: 1 }}>
              <Text variant="labelLarge">Workout time</Text>
              <Text variant="bodySmall" style={{ color: colors.onSurfaceVariant }}>Reminders count back from this</Text>
            </View>
            <IconButton icon="minus" mode="outlined" size={18} disabled={off} onPress={() => shiftTime(-15)} accessibilityLabel="15 minutes earlier" />
            <Text style={{ fontFamily: fonts.displaySmall.fontFamily, fontSize: 28, minWidth: 104, textAlign: 'center' }} accessibilityLabel={`Workout time ${timeLabel}`}>
              {timeLabel}
            </Text>
            <IconButton icon="plus" mode="outlined" size={18} disabled={off} onPress={() => shiftTime(15)} accessibilityLabel="15 minutes later" />
          </View>
          <Text variant="labelLarge" style={{ paddingHorizontal: 16, paddingTop: 12, opacity: off ? 0.45 : 1 }}>Notify me</Text>
          {LEAD_OPTIONS.map((o) => (
            <Checkbox.Item
              key={o.value}
              label={o.label}
              status={notif?.leads.includes(o.value) ? 'checked' : 'unchecked'}
              disabled={off}
              onPress={() => toggleLead(o.value)}
              position="leading"
              labelStyle={{ textAlign: 'left' }}
            />
          ))}
          {Platform.OS === 'android' && exactOk === false && (
            <List.Item
              title="Rest alarm on time"
              description="Android may deliver the rest alert late while the phone is locked. Allow alarms to fix it."
              descriptionNumberOfLines={3}
              left={(p) => <List.Icon {...p} icon="alarm" />}
              right={() => <Button onPress={() => allowExactAlarms().then(setExactOk)}>Allow</Button>}
            />
          )}
        </List.Section>

        <List.Section>
          <List.Subheader>Appearance</List.Subheader>
          <View style={{ paddingHorizontal: 16 }}>
            <SegmentedButtons
              value={theme}
              onValueChange={(v) => save(setTheme(v as ThemeSetting))}
              buttons={[
                { value: 'system', label: 'System', icon: 'theme-light-dark' },
                { value: 'light', label: 'Light', icon: 'white-balance-sunny' },
                { value: 'dark', label: 'Dark', icon: 'weather-night' },
              ]}
            />
          </View>
        </List.Section>

        <List.Section>
          <List.Subheader>Data</List.Subheader>
          <List.Item
            title="Export workout logs"
            description="Saves every log as a JSON file you can share. Videos aren't included."
            descriptionNumberOfLines={2}
            left={(p) => <List.Icon {...p} icon="export-variant" />}
            onPress={doExport}
            disabled={busy}
          />
          <List.Item
            title="Clear all workout logs"
            description="Keeps your workouts and schedule"
            titleStyle={{ color: colors.error }}
            left={(p) => <List.Icon {...p} icon="delete-outline" color={colors.error} />}
            onPress={askClearLogs}
            disabled={busy}
          />
          <List.Item
            title="Clear everything"
            description="Deletes all data, videos and settings"
            titleStyle={{ color: colors.error }}
            left={(p) => <List.Icon {...p} icon="delete-forever-outline" color={colors.error} />}
            onPress={askClearEverything}
            disabled={busy}
          />
        </List.Section>
      </ScrollView>

      <Portal>
        <Dialog visible={confirm !== null} onDismiss={() => !busy && setConfirm(null)}>
          <Dialog.Title>{confirm?.title}</Dialog.Title>
          <Dialog.Content>
            <Text>{confirm?.body}</Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setConfirm(null)} disabled={busy}>Cancel</Button>
            <Button mode="contained" buttonColor={colors.error} textColor={colors.onError} onPress={runConfirmed} loading={busy} disabled={busy}>
              {confirm?.action}
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
      <Snackbar visible={!!message} onDismiss={() => setMessage('')} duration={3000}>{message}</Snackbar>
    </View>
  );
}

/**
 * Minus / value / plus control for a numeric setting.
 * @param props - Displayed value, handlers, and what it adjusts (for screen readers)
 * @returns The stepper
 */
function Stepper({ label, onMinus, onPlus, what }: { label: string; onMinus: () => void; onPlus: () => void; what: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <IconButton icon="minus" size={18} mode="outlined" onPress={onMinus} accessibilityLabel={`Decrease ${what}`} />
      <Text variant="titleMedium" style={{ minWidth: 44, textAlign: 'center' }}>{label}</Text>
      <IconButton icon="plus" size={18} mode="outlined" onPress={onPlus} accessibilityLabel={`Increase ${what}`} />
    </View>
  );
}
