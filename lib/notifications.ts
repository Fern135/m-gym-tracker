/**
 * @file notifications.ts
 * @description All local notification logic lives here. The rest-timer alert
 * is implemented; workout-day reminders (rescheduleAll) arrive in batch 7.
 */
// shortcut: deep imports instead of 'expo-notifications'. The package index also loads the push
// topic module, which Expo Go 58 on Android doesn't ship, and crashes at import. Local notifications
// only need these files. Switch back to the index import once Expo Go includes it or we use a dev build.
import { cancelScheduledNotificationAsync } from 'expo-notifications/build/cancelScheduledNotificationAsync';
import { AndroidImportance } from 'expo-notifications/build/NotificationChannelManager.types';
import { getPermissionsAsync } from 'expo-notifications/build/NotificationPermissions';
import { SchedulableTriggerInputTypes } from 'expo-notifications/build/Notifications.types';
import { scheduleNotificationAsync } from 'expo-notifications/build/scheduleNotificationAsync';
import { setNotificationChannelAsync } from 'expo-notifications/build/setNotificationChannelAsync';
import { Platform } from 'react-native';

const Notifications = {
  AndroidImportance,
  SchedulableTriggerInputTypes,
  cancelScheduledNotificationAsync,
  getPermissionsAsync,
  scheduleNotificationAsync,
  setNotificationChannelAsync,
};

const REST_CHANNEL = 'rest-timer';

/**
 * Asks the OS for notification permission.
 * @returns Whether permission is granted
 */
export async function requestPermission(): Promise<boolean> {
  return false; // implemented in batch 7
}

/**
 * Cancels everything and schedules the next 4 weeks of workout notifications.
 */
export async function rescheduleAll(): Promise<void> {
  // implemented in batch 7. Must cancel only workout-* ids, never a running rest timer.
}

/**
 * Cancels every pending workout notification.
 */
export async function cancelAll(): Promise<void> {
  // implemented in batch 7
}

/**
 * Schedules the "rest's over" alert so it still fires if the app is in the
 * background. In the foreground the timer screen vibrates itself.
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
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at, channelId: REST_CHANNEL },
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
