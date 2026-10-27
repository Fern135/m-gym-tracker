/**
 * @file days.ts
 * @description Day-of-week names and ordering. day_of_week follows SQLite and
 * JS Date: 0 = Sunday through 6 = Saturday.
 */
import type { FirstDayOfWeek } from './settings';

export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * The seven day_of_week values in display order.
 * @param first - 0 to start on Sunday, 1 to start on Monday
 * @returns e.g. [1,2,3,4,5,6,0] when the week starts on Monday
 */
export function orderedDays(first: FirstDayOfWeek): number[] {
  return [0, 1, 2, 3, 4, 5, 6].map((i) => (first + i) % 7);
}
