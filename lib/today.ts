/**
 * @file today.ts
 * @description Loads everything the Today tab shows. First records any past
 * scheduled days that were never logged as missed, then builds this week's
 * cards, the missed-in-a-row warnings and any whole weeks still needing a reason.
 */
import { startOfWeek, parseISO } from 'date-fns';
import { getEarliestUnexcusedMiss, getLogsBetween, getMissedAndActiveDates, getSchedule, getTemplate, getTemplateHistory, recordMissedDays } from './db';
import { getSetting, setSetting, type FirstDayOfWeek } from './settings';
import { buildWeek, findMissedDays, missedWeekRuns, missStreak, shiftDate, toDateStr, weekDates, type DayCard, type MissedRun, type Streak } from './week';

export type TodayData = {
  today: string;
  week: DayCard[];
  todayCard: DayCard;
  /** Exercise names of today's workout, in order. */
  exercises: string[];
  /** Whole missed weeks with no reason yet, oldest first. */
  missedRuns: MissedRun[];
};

/**
 * Records past scheduled-but-unlogged days as missed, from the last check up to yesterday.
 * On the very first run it only sets the starting point, so nothing before
 * the user started using the app counts as missed.
 * @param today - YYYY-MM-DD
 */
export async function recordMissed(today: string): Promise<void> {
  const yesterday = shiftDate(today, -1);
  const checked = await getSetting('missed_checked_through');
  if (!checked) return setSetting('missed_checked_through', yesterday);
  if (checked >= yesterday) return;

  const [schedule, logs] = await Promise.all([getSchedule(), getLogsBetween(shiftDate(checked, 1), yesterday)]);
  const missed = findMissedDays(checked, today, schedule, new Set(logs.map((l) => l.date)));
  await recordMissedDays(missed, yesterday);
}

/**
 * Loads the Today tab.
 * @param firstDay - Week start from settings
 * @returns Everything the screen renders
 */
export async function loadToday(firstDay: FirstDayOfWeek): Promise<TodayData> {
  const today = toDateStr(new Date());
  await recordMissed(today);

  const dates = weekDates(today, firstDay);
  const [schedule, logs] = await Promise.all([getSchedule(), getLogsBetween(dates[0], dates[6])]);

  // Missed-in-a-row counts for each workout still ahead this week.
  const streaks = new Map<number, Streak>();
  for (const s of schedule) {
    if (!streaks.has(s.template_id)) streaks.set(s.template_id, missStreak(await getTemplateHistory(s.template_id, today)));
  }

  const week = buildWeek(dates, today, schedule, logs, streaks);
  const todayCard = week.find((d) => d.isToday)!;
  const template = todayCard.templateId !== null ? await getTemplate(todayCard.templateId) : null;

  const earliest = await getEarliestUnexcusedMiss();
  let missedRuns: MissedRun[] = [];
  if (earliest) {
    const { missed, active } = await getMissedAndActiveDates(toDateStr(startOfWeek(parseISO(earliest), { weekStartsOn: firstDay })));
    missedRuns = missedWeekRuns(missed, active, today, firstDay);
  }

  return { today, week, todayCard, exercises: template?.exercises.map((e) => e.name) ?? [], missedRuns };
}
