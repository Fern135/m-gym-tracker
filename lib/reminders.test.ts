/**
 * @file reminders.test.ts
 * @description Assert-based checks for reminders.ts. Run with: npx -y tsx lib/reminders.test.ts
 */
import assert from 'node:assert/strict';
import type { ScheduleDay } from './db';
import { MAX_REMINDERS, planReminders } from './reminders';

// 2026-11-02 is a Monday. Upper Body Mon/Wed/Fri at 08:00.
const upper: ScheduleDay[] = [1, 3, 5].map((d) => ({ day_of_week: d, template_id: 1, template_name: 'Upper Body' }));
const base = { schedule: upper, workoutTime: { hour: 8, minute: 0 }, loggedDates: new Set<string>(), streaks: new Map<number, number>() };

// Spec test: Mon/Wed/Fri with 1-hour and 15-min leads → 2 per workout day, ids and times right.
const r = planReminders({ ...base, now: new Date(2026, 10, 1, 12), leadTimes: ['1_hour', '15_min'] });
assert.equal(r.length, 12 * 2); // 4 weeks × 3 days × 2 leads
assert.equal(r[0].id, 'workout-2026-11-02-1_hour');
assert.deepEqual(r[0].at, new Date(2026, 10, 2, 7, 0));
assert.deepEqual(r[1].at, new Date(2026, 10, 2, 7, 45));
assert.equal(r[0].body, 'Upper Body is scheduled for today');

// Past times are dropped: at 07:30 Monday only the 15-min one is left for today.
const r2 = planReminders({ ...base, now: new Date(2026, 10, 2, 7, 30), leadTimes: ['1_hour', '15_min'] });
assert.equal(r2[0].id, 'workout-2026-11-02-15_min');

// Day before fires 8 PM the night before; check-in 9 PM; logged days get nothing.
const r3 = planReminders({ ...base, now: new Date(2026, 10, 2, 10), leadTimes: ['day_before', 'evening_checkin'], loggedDates: new Set(['2026-11-02']) });
assert.equal(r3[0].id, 'workout-2026-11-04-day_before');
assert.deepEqual(r3[0].at, new Date(2026, 10, 3, 20));
assert.equal(r3[0].body, 'Upper Body tomorrow — get ready');
assert.equal(r3[1].id, 'workout-2026-11-04-evening_checkin');
assert.deepEqual(r3[1].at, new Date(2026, 10, 4, 21));

// Escalated text only on the next occurrence.
const r4 = planReminders({ ...base, now: new Date(2026, 10, 1, 12), leadTimes: ['at_time'], streaks: new Map([[1, 2]]) });
assert.equal(r4[0].body, "Upper Body today — you've missed it 2 times in a row.");
assert.equal(r4[1].body, 'Upper Body is scheduled for today');

// Cap: every day, all six leads → capped at 60, nearest first.
const daily: ScheduleDay[] = [0, 1, 2, 3, 4, 5, 6].map((d) => ({ day_of_week: d, template_id: 1, template_name: 'X' }));
const r5 = planReminders({ ...base, schedule: daily, now: new Date(2026, 10, 1, 0, 1), leadTimes: ['day_before', '1_hour', '30_min', '15_min', 'at_time', 'evening_checkin'] });
assert.equal(r5.length, MAX_REMINDERS);
assert.ok(r5.every((x, i) => i === 0 || x.at >= r5[i - 1].at));

console.log('reminders.test.ts: all passed');
