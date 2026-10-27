/**
 * @file week.ts
 * @description Pure date and status logic: which past days were missed, how
 * many times in a row a workout was missed, each day's status in the week
 * strip, and which whole weeks were missed. No database access, so it can be
 * tested directly (see week.test.ts).
 */
import { addDays, differenceInCalendarDays, format, parseISO, startOfWeek } from 'date-fns';
import type { LogSummary, ScheduleDay } from './db';
import type { FirstDayOfWeek } from './settings';

/**
 * Formats a Date as a local YYYY-MM-DD string (the format stored in workout_logs.date).
 * @param d - Date
 * @returns e.g. "2026-10-27"
 */
export const toDateStr = (d: Date): string => format(d, 'yyyy-MM-dd');

/**
 * Shifts a YYYY-MM-DD date by whole days.
 * @param date - YYYY-MM-DD
 * @param days - Days to add (negative to go back)
 * @returns YYYY-MM-DD
 */
export const shiftDate = (date: string, days: number): string => toDateStr(addDays(parseISO(date), days));

/**
 * The seven dates of the week containing `today`.
 * @param today - YYYY-MM-DD
 * @param firstDay - 0 = weeks start Sunday, 1 = Monday
 * @returns Seven YYYY-MM-DD strings in display order
 */
export function weekDates(today: string, firstDay: FirstDayOfWeek): string[] {
  const start = startOfWeek(parseISO(today), { weekStartsOn: firstDay });
  return [0, 1, 2, 3, 4, 5, 6].map((i) => toDateStr(addDays(start, i)));
}

export type MissedDay = { date: string; template_id: number; template_name: string };

/**
 * Past scheduled days with no log, between the last check and yesterday.
 * Uses the schedule as it is now: this runs every time the app opens, so the
 * rule in effect is the one that applied on those days.
 * @param checkedThrough - Last date already checked, YYYY-MM-DD
 * @param today - YYYY-MM-DD; today itself is never missed yet
 * @param schedule - Active weekly schedule
 * @param loggedDates - Dates that already have a log
 * @returns Days to record as missed, oldest first
 */
export function findMissedDays(checkedThrough: string, today: string, schedule: ScheduleDay[], loggedDates: Set<string>): MissedDay[] {
  const byDay = new Map(schedule.map((s) => [s.day_of_week, s]));
  const out: MissedDay[] = [];
  for (let date = shiftDate(checkedThrough, 1); date < today; date = shiftDate(date, 1)) {
    const entry = byDay.get(parseISO(date).getDay());
    if (entry && !loggedDates.has(date)) out.push({ date, template_id: entry.template_id, template_name: entry.template_name });
  }
  return out;
}

export type Streak = { count: number; lastMissed: string | null };

/**
 * How many times in a row a workout was missed, walking back from the newest log.
 * A completion ends the run. Skips with a reason and misses inside an explained
 * break are neutral: they neither add to the run nor end it.
 * @param history - The workout's logs, newest first
 * @returns Missed-in-a-row count and the most recent missed date
 */
export function missStreak(history: Pick<LogSummary, 'date' | 'status' | 'excused'>[]): Streak {
  let count = 0;
  let lastMissed: string | null = null;
  for (const log of history) {
    if (log.status === 'completed') break;
    if (log.status === 'missed' && !log.excused) {
      count++;
      lastMissed ??= log.date;
    }
  }
  return { count, lastMissed };
}

/** 0 = normal, 1 = yellow (missed once), 2 = red (missed twice or more in a row). */
export type Warning = 0 | 1 | 2;

/**
 * Maps a missed-in-a-row count to a warning level.
 * @param count - Consecutive misses
 * @returns Warning level
 */
export const warningFor = (count: number): Warning => (count >= 2 ? 2 : count === 1 ? 1 : 0);

/**
 * - completed / skipped / missed: there is a log with that status
 * - break: missed, but inside a break the user explained
 * - upcoming: scheduled, today or later, not logged yet
 * - untracked: scheduled in the past but before the app started tracking
 * - rest: nothing scheduled
 */
export type DayState = 'completed' | 'skipped' | 'missed' | 'break' | 'upcoming' | 'untracked' | 'rest';

export type DayCard = {
  date: string;
  isToday: boolean;
  name: string | null;
  templateId: number | null;
  state: DayState;
  warning: Warning;
  /** Most recent miss behind the warning, for the "You missed it last Monday" line. */
  lastMissed: string | null;
  log: LogSummary | null;
};

/**
 * Derives each day's card for the week strip.
 * A log always wins over the schedule, so past days keep what actually happened
 * even if the schedule changed since. Only the first upcoming occurrence of each
 * workout carries a warning: that's the one you can't miss.
 * @param dates - The week's dates in display order
 * @param today - YYYY-MM-DD
 * @param schedule - Active weekly schedule
 * @param logs - Logs for these dates
 * @param streaks - Missed-in-a-row per template id, counted up to today
 * @returns One card per date
 */
export function buildWeek(dates: string[], today: string, schedule: ScheduleDay[], logs: LogSummary[], streaks: Map<number, Streak>): DayCard[] {
  const byDay = new Map(schedule.map((s) => [s.day_of_week, s]));
  const byDate = new Map(logs.map((l) => [l.date, l]));
  const warned = new Set<number>();

  return dates.map((date) => {
    const isToday = date === today;
    const log = byDate.get(date) ?? null;
    if (log) {
      const state: DayState = log.status === 'missed' && log.excused ? 'break' : log.status;
      return { date, isToday, name: log.template_name, templateId: log.template_id, state, warning: 0, lastMissed: null, log };
    }
    const entry = byDay.get(parseISO(date).getDay());
    if (!entry) return { date, isToday, name: null, templateId: null, state: 'rest', warning: 0, lastMissed: null, log: null };
    if (date < today) {
      return { date, isToday, name: entry.template_name, templateId: entry.template_id, state: 'untracked', warning: 0, lastMissed: null, log: null };
    }
    let warning: Warning = 0;
    let lastMissed: string | null = null;
    if (!warned.has(entry.template_id)) {
      warned.add(entry.template_id);
      const s = streaks.get(entry.template_id);
      warning = warningFor(s?.count ?? 0);
      lastMissed = s?.lastMissed ?? null;
    }
    return { date, isToday, name: entry.template_name, templateId: entry.template_id, state: 'upcoming', warning, lastMissed, log: null };
  });
}

export type MissedRun = { start: string; end: string; weeks: number };

/**
 * Finds runs of whole weeks where workouts were missed and nothing was completed
 * or skipped. Back-to-back weeks merge into one run so the user explains them
 * once ("Missed 4 weeks"). Only weeks that have fully ended count.
 * @param missed - Unexcused missed dates
 * @param active - Dates with a completed or skipped log
 * @param today - YYYY-MM-DD
 * @param firstDay - Week start
 * @returns Runs, oldest first; start/end are the first and last day of the run
 */
export function missedWeekRuns(missed: string[], active: string[], today: string, firstDay: FirstDayOfWeek): MissedRun[] {
  const weekOf = (d: string) => toDateStr(startOfWeek(parseISO(d), { weekStartsOn: firstDay }));
  const activeWeeks = new Set(active.map(weekOf));
  const weeks = [...new Set(missed.map(weekOf))]
    .filter((w) => !activeWeeks.has(w) && shiftDate(w, 6) < today)
    .sort();

  const runs: MissedRun[] = [];
  for (const w of weeks) {
    const last = runs[runs.length - 1];
    if (last && differenceInCalendarDays(parseISO(w), parseISO(last.end)) === 1) {
      last.end = shiftDate(w, 6);
      last.weeks++;
    } else {
      runs.push({ start: w, end: shiftDate(w, 6), weeks: 1 });
    }
  }
  return runs;
}
