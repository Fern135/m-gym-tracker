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
import { AndroidImportance } from 'expo-notifications/build/NotificationChannelManager.types';
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
import { getLeadTimes, getNotificationsEnabled, getSetting, getWorkoutTime, setSetting } from './settings';
import { recordMissed } from './today';
import { missStreak, shiftDate, toDateStr } from './week';

const Notifications = {
  AndroidImportance,
  SchedulableTriggerInputTypes,
  cancelScheduledNotificationAsync,
  getAllScheduledNotificationsAsync,
  getExactAlarmPermissionsAsync,
  getPermissionsAsync,
  requestExactAlarmPermissionsAsync,
  requestPermissionsAsync,
  scheduleNotificationAsync,
  setNotificationChannelAsync,
};

const REST_CHANNEL = 'rest-timer';
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
    const [schedule, leadTimes, workoutTime, logs] = await Promise.all([
      getSchedule(), getLeadTimes(), getWorkoutTime(), getLogsBetween(today, shiftDate(today, LOOKAHEAD_DAYS)),
    ]);
    const streaks = new Map<number, number>();
    for (const s of schedule) {
      if (!streaks.has(s.template_id)) streaks.set(s.template_id, missStreak(await getTemplateHistory(s.template_id, today)).count);
    }

    const reminders = planReminders({ now, schedule, leadTimes, workoutTime, loggedDates: new Set(logs.map((l) => l.date)), streaks });
    if (Platform.OS === 'android' && reminders.length > 0) {
      await Notifications.setNotificationChannelAsync(WORKOUT_CHANNEL, { name: 'Workout reminders', importance: Notifications.AndroidImportance.DEFAULT });
    }
    // A date trigger per occurrence (not a weekly repeat), so skipped and logged days can be left out.
    for (const r of reminders) {
      await Notifications.scheduleNotificationAsync({
        identifier: r.id,
        content: { title: r.title, body: r.body, sound: true },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: r.at, channelId: WORKOUT_CHANNEL },
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
    const { granted } = await Notifications.getPermissionsAsync();
    if (!granted) return null;
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(REST_CHANNEL, {
        name: 'Rest timer',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 400, 200, 400],
      });
    }
    return await Notifications.scheduleNotificationAsync({
      content: { title: "Rest's over", body: 'Time for your next set.', sound: true },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at, channelId: REST_CHANNEL, delivery: 'alarmClock' },
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
