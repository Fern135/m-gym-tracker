/**
 * @file workout.test.ts
 * @description Assert-based checks for workout.ts. Run with: npm test
 */
import assert from 'node:assert/strict';
import { formatClock, formatDuration, formatSet, parseNum, setsLeftLabel } from './workout';

assert.equal(setsLeftLabel(0, 3), '3 sets left');
assert.equal(setsLeftLabel(2, 3), '1 set left');
assert.equal(setsLeftLabel(3, 3), 'All sets done');
assert.equal(setsLeftLabel(4, 3), '1 extra set');
assert.equal(setsLeftLabel(6, 3), '3 extra sets');

assert.equal(parseNum('135.5'), 135.5);
assert.equal(parseNum('62,5'), 62.5);
assert.equal(parseNum('10.7', true), 10);
assert.equal(parseNum(''), null);
assert.equal(parseNum('abc'), null);
assert.equal(parseNum('-5'), null);

assert.equal(formatSet({ reps: 10, weight: 135 }, 'lbs'), '10 reps × 135 lbs');
assert.equal(formatSet({ reps: 10, weight: null }, 'kg'), '10 reps');
assert.equal(formatSet({ reps: null, weight: null }, 'kg'), '—');

assert.equal(formatClock(90), '1:30');
assert.equal(formatClock(5.2), '0:06');
assert.equal(formatClock(-3), '0:00');

assert.equal(formatDuration(45), '45 s');
assert.equal(formatDuration(89), '1 min');
assert.equal(formatDuration(52 * 60 + 10), '52 min');
assert.equal(formatDuration(65 * 60), '1 h 5 min');
assert.equal(formatDuration(119.7 * 60), '2 h');

console.log('workout.test.ts: all checks passed');
