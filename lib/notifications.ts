/**
 * @file notifications.ts
 * @description All local notification logic lives here: the permission prompt,
 * workout-day reminders (planned in reminders.ts, scheduled here) and the
 * rest-timer alert. Everything is on-device; nothing needs the internet.
 */
// shortcut: deep imports instead of 'expo-notifications'. The package index also loads the push
// topic module, which Expo Go 58 on Android doesn't ship, and crashes at import. Local notifications
// only need these files. Switch back to the index import once Expo Go includes it or we use a dev build.
import { cancelScheduledNotificationAsync } from 'expo-notifications/build/cancelScheduledNotificationAsync';
import { getAllScheduledNotificationsAsync } from 'expo-notifications/build/getAllScheduledNotificationsAsync';
import { deleteNotificationChannelAsync } from 'expo-notifications/build/deleteNotificationChannelAsync';
import { AndroidAudioUsage, AndroidImportance } from 'expo-notifications/build/NotificationChannelManager.types';
import {
  getExactAlarmPermissionsAsync,
  getPermissionsAsync,
  requestExactAlarmPermissionsAsync,
  requestPermissionsAsync,
} from 'expo-notifications/build/NotificationPermissions';
import { SchedulableTriggerInputTypes } from 'expo-notifications/build/Notifications.types';
import { scheduleNotificationAsync } from 'expo-notifications/build/scheduleNotificationAsync';
import { setNotificationChannelAsync } from 'expo-notifications/build/setNotificationChannelAsync';
import { Platform } from 'react-native';
import { getLogsBetween, getSchedule, getTemplateHistory } from './db';
import { LOOKAHEAD_DAYS, planReminders } from './reminders';
import { getLeadTimes, getNotificationsEnabled, getReminderSound, getRestSound, getSetting, getWorkoutTime, setSetting } from './settings';
import { REMINDER_SOUNDS, REST_SOUNDS } from './sounds';
import { recordMissed } from './today';
import { missStreak, shiftDate, toDateStr } from './week';

const Notifications = {
  AndroidAudioUsage,
  AndroidImportance,
  SchedulableTriggerInputTypes,
  cancelScheduledNotificationAsync,
  deleteNotificationChannelAsync,
  getAllScheduledNotificationsAsync,
  getExactAlarmPermissionsAsync,
  getPermissionsAsync,
  requestExactAlarmPermissionsAsync,
  requestPermissionsAsync,
  scheduleNotificationAsync,
  setNotificationChannelAsync,
};

// Android channels can't change their sound once created, so there's one channel per sound.
// Only the picked one is kept, so Android's settings list a single "Rest timer" / "Evening-before reminder".
const restChannel = (sound: string) => `rest-alarm-${sound}`;
const OLD_REST_CHANNELS = ['rest-timer', 'rest-timer-alarm', 'rest-alarm', ...REST_SOUNDS.map((s) => restChannel(s.value))];
const dayBeforeChannel = (sound: string) => `day-before-${sound}`;
const DAY_BEFORE_CHANNELS = REMINDER_SOUNDS.map((s) => dayBeforeChannel(s.value));
const WORKOUT_CHANNEL = 'workout-reminders';
/** Every workout reminder id starts with this (workout-{YYYY-MM-DD}-{lead}), so they can be cancelled without touching the rest timer. */
const WORKOUT_ID_PREFIX = 'workout-';

/**
 * Asks the OS for notification permission.
 * @returns Whether permission is granted
 */
export async function requestPermission(): Promise<boolean> {
  try {
    return (await Notifications.requestPermissionsAsync()).granted;
  } catch {
    return false;
  }
}

/**
 * Runs on every launch, after the database is ready: asks for permission the
 * first time only, then refills the 4-week reminder window.
 */
export async function setupNotifications(): Promise<void> {
  if (!(await getSetting('notification_permission_asked'))) {
    await setSetting('notification_permission_asked', 'true');
    await requestPermission();
  }
  await rescheduleAll();
}

/**
 * Cancels every pending workout reminder. A running rest-timer alert is left alone.
 */
export async function cancelAll(): Promise<void> {
  const pending = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    pending.filter((n) => n.identifier.startsWith(WORKOUT_ID_PREFIX)).map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
  );
}

/**
 * Current notification permission.
 * @returns Whether it's granted, and whether the OS will still show the prompt
 */
export async function getPermission(): Promise<{ granted: boolean; canAskAgain: boolean }> {
  try {
    const { granted, canAskAgain } = await Notifications.getPermissionsAsync();
    return { granted, canAskAgain };
  } catch {
    return { granted: false, canAskAgain: false };
  }
}

let queue: Promise<void> = Promise.resolve();
let waiting: Promise<void> | null = null;

/**
 * Cancels all workout reminders and schedules the next 4 weeks again.
 * Calls run one after another so two quick changes can't interleave and leave stale reminders.
 * Calls made while a pass is still waiting to start share it, since it reads the newest settings anyway
 * (tapping the workout-time stepper 8 times runs at most 2 passes, not 8).
 * Never throws: a notification failure must not fail the save that triggered it.
 */
export function rescheduleAll(): Promise<void> {
  if (waiting) return waiting;
  waiting = queue.then(() => {
    waiting = null;
    return reschedule();
  });
  queue = waiting;
  return waiting;
}

/** One reschedule pass; see rescheduleAll. */
async function reschedule(): Promise<void> {
  try {
    await cancelAll();
    const [enabled, permission] = await Promise.all([getNotificationsEnabled(), Notifications.getPermissionsAsync()]);
    if (!enabled || !permission.granted) return;

    const now = new Date();
    const today = toDateStr(now);
    // The missed-in-a-row text needs past misses recorded, even if the Today tab wasn't opened yet.
    await recordMissed(today);
    const [schedule, leadTimes, workoutTime, logs, reminderSound] = await Promise.all([
      getSchedule(), getLeadTimes(), getWorkoutTime(), getLogsBetween(today, shiftDate(today, LOOKAHEAD_DAYS)), getReminderSound(),
    ]);
    const streaks = new Map<number, number>();
    for (const s of schedule) {
      if (!streaks.has(s.template_id)) streaks.set(s.template_id, missStreak(await getTemplateHistory(s.template_id, today)).count);
    }

    const reminders = planReminders({ now, schedule, leadTimes, workoutTime, loggedDates: new Set(logs.map((l) => l.date)), streaks });
    const sound = REMINDER_SOUNDS.find((s) => s.value === reminderSound)!;
    const dayBefore = dayBeforeChannel(sound.value);
    if (Platform.OS === 'android' && reminders.length > 0) {
      await Notifications.setNotificationChannelAsync(WORKOUT_CHANNEL, { name: 'Workout reminders', importance: Notifications.AndroidImportance.DEFAULT });
      await Promise.all(DAY_BEFORE_CHANNELS.filter((c) => c !== dayBefore).map((c) => Notifications.deleteNotificationChannelAsync(c)));
      await Notifications.setNotificationChannelAsync(dayBefore, {
        name: 'Evening-before reminder',
        importance: Notifications.AndroidImportance.DEFAULT,
        ...(sound.file && { sound: sound.file }),
      });
    }
    // A date trigger per occurrence (not a weekly repeat), so skipped and logged days can be left out.
    for (const r of reminders) {
      const isDayBefore = r.id.endsWith('-day_before'); // ids are workout-{date}-{lead}
      await Notifications.scheduleNotificationAsync({
        identifier: r.id,
        content: { title: r.title, body: r.body, sound: (isDayBefore && sound.file) || true },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: r.at, channelId: isDayBefore ? dayBefore : WORKOUT_CHANNEL },
      });
    }
  } catch (e) {
    console.warn('Rescheduling notifications failed:', e);
  }
}

/**
 * Whether Android lets the app fire alarms at an exact time (needed for an on-time rest alert).
 * @returns Always true on iOS
 */
export async function exactAlarmsAllowed(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  try {
    return (await Notifications.getExactAlarmPermissionsAsync()).granted;
  } catch {
    return true; // can't tell; don't nag
  }
}

/**
 * Opens Android's "Alarms & reminders" screen for this app and waits for the user to come back.
 * @returns Whether exact alarms are now allowed
 */
export async function allowExactAlarms(): Promise<boolean> {
  try {
    return (await Notifications.requestExactAlarmPermissionsAsync()).granted;
  } catch {
    return false;
  }
}

/**
 * Schedules the "rest's over" alert so it still fires if the app is in the
 * background. In the foreground the timer screen vibrates itself.
 * Uses an alarm-clock alarm on Android so a locked phone doesn't deliver it late;
 * without the exact alarm permission Android falls back to a best-effort time.
 * Silently does nothing without notification permission.
 * @param at - When the rest ends
 * @returns The notification id, or null if not scheduled
 */
export async function scheduleRestEnd(at: Date): Promise<string | null> {
  try {
    const [{ granted }, restSound] = await Promise.all([Notifications.getPermissionsAsync(), getRestSound()]);
    if (!granted) return null;
    const sound = REST_SOUNDS.find((s) => s.value === restSound)!;
    const channel = restChannel(sound.value);
    if (Platform.OS === 'android') {
      await Promise.all(OLD_REST_CHANNELS.filter((c) => c !== channel).map((c) => Notifications.deleteNotificationChannelAsync(c)));
      // Alarm audio plays even when the phone is on vibrate, like an alarm clock.
      await Notifications.setNotificationChannelAsync(channel, {
        name: 'Rest timer',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 400, 200, 400],
        sound: sound.file,
        audioAttributes: { usage: Notifications.AndroidAudioUsage.ALARM },
      });
    }
    return await Notifications.scheduleNotificationAsync({
      content: { title: "Rest's over", body: 'Time for your next set.', sound: sound.file ?? true },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at, channelId: channel, delivery: 'alarmClock' },
    });
  } catch {
    return null; // the in-app timer still works
  }
}

/**
 * Cancels a scheduled rest-timer alert.
 * @param id - Id returned by scheduleRestEnd
 */
export async function cancelRestEnd(id: string | null): Promise<void> {
  if (id) await Notifications.cancelScheduledNotificationAsync(id).catch(() => undefined);
}
