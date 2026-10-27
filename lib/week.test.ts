/**
 * @file week.test.ts
 * @description Assert-based checks for week.ts. Run with: npx -y tsx lib/week.test.ts
 */
import assert from 'node:assert/strict';
import type { LogSummary, ScheduleDay } from './db';
import { buildWeek, findMissedDays, missedWeekRuns, missStreak, weekDates } from './week';

// 2026-10-26 is a Monday. Upper Body Mon/Wed/Fri.
const upper: ScheduleDay[] = [1, 3, 5].map((d) => ({ day_of_week: d, template_id: 1, template_name: 'Upper Body' }));
const log = (date: string, status: LogSummary['status'], excused = 0): LogSummary =>
  ({ id: 0, template_id: 1, template_name: 'Upper Body', date, status, notes: null, excused, duration_seconds: null, rest_seconds: null });

// Week order follows first day of week.
assert.deepEqual(weekDates('2026-10-28', 1)[0], '2026-10-26');
assert.deepEqual(weekDates('2026-10-28', 0)[0], '2026-10-25');

// Missed days: only scheduled, unlogged, after the marker and before today.
assert.deepEqual(
  findMissedDays('2026-10-25', '2026-10-30', upper, new Set(['2026-10-28'])).map((m) => m.date),
  ['2026-10-26'], // Mon missed; Wed logged; Fri is today
);

// Streak: skips and excused misses are neutral; a completion ends the run.
assert.deepEqual(missStreak([log('10-30', 'missed'), log('10-28', 'skipped'), log('10-26', 'missed'), log('10-23', 'completed'), log('10-21', 'missed')]), { count: 2, lastMissed: '10-30' });
assert.equal(missStreak([log('a', 'missed', 1)]).count, 0);
assert.equal(missStreak([]).count, 0);

// Week strip: Mon missed (log), Wed today with one miss → yellow; Fri is not the first occurrence → no warning.
const week = buildWeek(weekDates('2026-10-28', 1), '2026-10-28', upper, [log('2026-10-26', 'missed')], new Map([[1, { count: 1, lastMissed: '2026-10-26' }]]));
assert.equal(week[0].state, 'missed');
assert.equal(week[1].state, 'rest');
assert.equal(week[2].state, 'upcoming');
assert.equal(week[2].warning, 1);
assert.equal(week[2].isToday, true);
assert.equal(week[4].warning, 0);
// A scheduled past day with no log predates tracking.
assert.equal(buildWeek(['2026-10-26'], '2026-10-28', upper, [], new Map())[0].state, 'untracked');
// An excused miss shows as a break.
assert.equal(buildWeek(['2026-10-26'], '2026-10-28', upper, [log('2026-10-26', 'missed', 1)], new Map())[0].state, 'break');

// Missed weeks: two back-to-back fully missed weeks merge; a week with a completion doesn't count; the current week doesn't count.
const runs = missedWeekRuns(['2026-10-05', '2026-10-07', '2026-10-12', '2026-10-19', '2026-10-26'], ['2026-10-21'], '2026-10-28', 1);
assert.deepEqual(runs, [{ start: '2026-10-05', end: '2026-10-18', weeks: 2 }]);

console.log('week.test.ts: all checks passed');
