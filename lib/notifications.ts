/**
 * @file notifications.ts
 * @description All local notification logic lives here. Stub until batch 7,
 * so callers added in batches 3 and 8 can already call rescheduleAll().
 */

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
  // implemented in batch 7
}

/**
 * Cancels every pending workout notification.
 */
export async function cancelAll(): Promise<void> {
  // implemented in batch 7
}
