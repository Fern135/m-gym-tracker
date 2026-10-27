/**
 * @file reminders.ts
 * @description Pure planning for workout-day notifications: which ones to
 * schedule, when, and what they say. No Expo or database access, so it can be
 * tested directly (see reminders.test.ts). lib/notifications.ts schedules the result.
 */
import { addDays, set, startOfDay, subMinutes } from 'date-fns';
import type { ScheduleDay } from './db';
import type { LeadTime } from './settings';
import { toDateStr } from './week';

/** iOS keeps at most 64 pending notifications per app; 60 leaves room for the rest timer. */
export const MAX_REMINDERS = 60;
/** Four weeks ahead. The app reschedules on every launch and change, so the window keeps rolling. */
export const LOOKAHEAD_DAYS = 28;

export type Reminder = { id: string; at: Date; title: string; body: string };

/** Minutes before the workout time for the leads tied to it. day_before and evening_checkin use fixed clock times. */
const OFFSET_MIN: Record<'1_hour' | '30_min' | '15_min' | 'at_time', number> = { '1_hour': 60, '30_min': 30, '15_min': 15, at_time: 0 };

type Input = {
  now: Date;
  schedule: ScheduleDay[];
  leadTimes: LeadTime[];
  workoutTime: { hour: number; minute: number };
  /** Dates already completed, skipped or missed: no reminders for those. */
  loggedDates: Set<string>;
  /** Missed-in-a-row count per template id. */
  streaks: Map<number, number>;
};

/**
 * Plans every workout notification for the next LOOKAHEAD_DAYS days.
 * Rest days and logged days get nothing. Only the next occurrence of a workout
 * mentions earlier misses, matching the yellow/red warning on the Today tab.
 * @param input - Current time, schedule, enabled lead times, workout time, logged dates and miss streaks
 * @returns Up to MAX_REMINDERS reminders, soonest first, all in the future
 */
export function planReminders({ now, schedule, leadTimes, workoutTime, loggedDates, streaks }: Input): Reminder[] {
  const byDay = new Map(schedule.map((s) => [s.day_of_week, s]));
  const warned = new Set<number>();
  const out: Reminder[] = [];

  for (let i = 0; i < LOOKAHEAD_DAYS; i++) {
    const day = addDays(startOfDay(now), i);
    const date = toDateStr(day);
    const entry = byDay.get(day.getDay());
    if (!entry || loggedDates.has(date)) continue;

    const name = entry.template_name;
    let missed = '';
    if (!warned.has(entry.template_id)) {
      warned.add(entry.template_id);
      const count = streaks.get(entry.template_id) ?? 0;
      missed = count >= 2 ? ` — you've missed it ${count} times in a row.` : count === 1 ? ' — you missed the last one.' : '';
    }

    for (const lead of leadTimes) {
      // day_before: 8 PM the night before. evening_checkin: 9 PM on the day. Others: workout time minus the offset.
      const at =
        lead === 'day_before' ? set(addDays(day, -1), { hours: 20 })
        : lead === 'evening_checkin' ? set(day, { hours: 21 })
        : subMinutes(set(day, { hours: workoutTime.hour, minutes: workoutTime.minute }), OFFSET_MIN[lead]);
      if (at <= now) continue;

      const id = `workout-${date}-${lead}`;
      if (lead === 'day_before') out.push({ id, at, title: 'Workout tomorrow', body: `${name} tomorrow${missed || ' — get ready'}` });
      else if (lead === 'evening_checkin') out.push({ id, at, title: 'Not logged yet', body: `You haven't logged ${name} today.` });
      else out.push({ id, at, title: 'Workout day 💪', body: missed ? `${name} today${missed}` : `${name} is scheduled for today` });
    }
  }

  // Nearest first, so the cap drops the reminders furthest away.
  return out.sort((a, b) => a.at.getTime() - b.at.getTime()).slice(0, MAX_REMINDERS);
}
