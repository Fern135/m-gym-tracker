/**
 * @file workout.ts
 * @description Shapes and pure helpers for a workout being logged: the
 * in-progress draft, the sets-left counter, number parsing for inputs, and time formatting.
 */

export type LoggedSet = { reps: number | null; weight: number | null };
export type DraftExercise = { name: string; sets: LoggedSet[] };

/** A workout in progress. Saved after every change so a killed app can resume it. */
export type WorkoutDraft = {
  date: string;
  templateId: number | null;
  templateName: string;
  exercises: DraftExercise[];
  /** Index of the exercise on screen. */
  index: number;
  /** When Start workout was tapped (ms since epoch); total time counts from here. */
  startedAt: number;
  /** Actual time spent on the rest timer so far, from Rest until Stop or Skip rest. */
  restMs: number;
};

/**
 * Counter shown under the exercise: counts down to the target, then counts extra sets up.
 * @param done - Sets logged for this exercise
 * @param target - Default sets per exercise from settings
 * @returns e.g. "3 sets left", "1 set left", "1 extra set", "2 extra sets"
 */
export function setsLeftLabel(done: number, target: number): string {
  const left = target - done;
  if (left > 0) return `${left} ${left === 1 ? 'set' : 'sets'} left`;
  const extra = -left;
  if (extra === 0) return 'All sets done';
  return `${extra} extra ${extra === 1 ? 'set' : 'sets'}`;
}

/**
 * Parses a numeric text input; blank or invalid becomes null.
 * @param text - Raw input, comma or dot as decimal separator
 * @param integer - Round down to a whole number (reps)
 * @returns The number, or null
 */
export function parseNum(text: string, integer = false): number | null {
  const n = Number(text.replace(',', '.').trim());
  if (!text.trim() || !Number.isFinite(n) || n < 0) return null;
  return integer ? Math.floor(n) : n;
}

/**
 * Formats a set for read-only display.
 * @param set - Reps and weight
 * @param unit - "lbs" or "kg" label (values are never converted)
 * @returns e.g. "10 reps × 135 lbs", "10 reps", "135 lbs", or "—"
 */
export function formatSet(set: LoggedSet, unit: string): string {
  const parts = [set.reps !== null ? `${set.reps} reps` : null, set.weight !== null ? `${set.weight} ${unit}` : null].filter(Boolean);
  return parts.length ? parts.join(' × ') : '—';
}

/**
 * Formats seconds as m:ss.
 * @param secs - Seconds, clamped at 0
 * @returns e.g. "1:30"
 */
export function formatClock(secs: number): string {
  const s = Math.max(0, Math.ceil(secs));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * Formats a workout length for people: minutes, or hours and minutes.
 * @param secs - Duration in seconds
 * @returns e.g. "45 s", "1 min", "52 min", "1 h 5 min", "2 h"
 */
export function formatDuration(secs: number): string {
  const s = Math.max(0, Math.round(secs));
  if (s < 60) return `${s} s`;
  const totalMin = Math.round(s / 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}
