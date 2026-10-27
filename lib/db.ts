/**
 * @file db.ts
 * @description The single home for all SQL in Ironweek. Opens the on-device
 * SQLite database, creates the schema on first launch, and exposes every query
 * as an async function.
 */
import * as SQLite from 'expo-sqlite';

/** Shared connection; a module singleton so non-React code (notifications) can query too. */
const db = SQLite.openDatabaseSync('ironweek.db');

/** Bump when the schema changes and add a migration step in initDb. */
const SCHEMA_VERSION = 4;

/** Default settings seeded on first launch and restored by "Clear everything". */
export const DEFAULT_SETTINGS = {
  weight_unit: 'lbs',
  theme: 'system',
  notifications_enabled: 'true',
  notification_workout_time: '08:00',
  // evening_checkin: 9 PM "you haven't logged it" on workout days still open.
  notification_lead_times: '["day_before","1_hour","15_min","evening_checkin"]',
  // 'true' once the first-launch notification permission prompt was shown, so it's asked only once.
  notification_permission_asked: '',
  first_day_of_week: '1',
  rest_seconds: '90',
  default_sets: '3',
  // Last date already checked for missed workouts (YYYY-MM-DD); empty until the first check.
  missed_checked_through: '',
  // JSON of the workout in progress (WorkoutDraft), empty when none.
  workout_draft: '',
} as const;

export type SettingKey = keyof typeof DEFAULT_SETTINGS;

/**
 * workout_logs DDL, parameterized by name so the v2 migration can build it alongside the old table.
 * @param name - Table name
 * @returns CREATE TABLE statement
 */
const workoutLogsSql = (name: string) => `
CREATE TABLE ${name} (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  template_id INTEGER REFERENCES workout_templates(id) ON DELETE SET NULL,
  template_name TEXT NOT NULL,
  date TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('completed','skipped','missed')),
  notes TEXT,
  created_at TEXT NOT NULL
);
`;

/** One log per date (one workout per day in v1); also lets missed-day inserts use INSERT OR IGNORE. */
const LOGS_DATE_INDEX_SQL = 'CREATE UNIQUE INDEX idx_workout_logs_date ON workout_logs(date);';

/** A stretch of missed time the user explained, e.g. "Health, doctor's orders". */
const BREAKS_SQL = `
CREATE TABLE breaks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL
);
`;

const SCHEMA_SQL = `
CREATE TABLE workout_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE template_exercises (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  template_id INTEGER NOT NULL REFERENCES workout_templates(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE schedule_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  template_id INTEGER NOT NULL REFERENCES workout_templates(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL,
  active INTEGER NOT NULL DEFAULT 1
);
${workoutLogsSql('workout_logs')}
${LOGS_DATE_INDEX_SQL}
CREATE TABLE log_sets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  log_id INTEGER NOT NULL REFERENCES workout_logs(id) ON DELETE CASCADE,
  exercise_name TEXT NOT NULL,
  set_number INTEGER NOT NULL,
  reps INTEGER,
  weight REAL,
  notes TEXT
);
CREATE TABLE log_photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  log_id INTEGER NOT NULL REFERENCES workout_logs(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
${BREAKS_SQL}
`;

/** v2 → v3: how long each completed workout took, and how much of it was rest. Null for older logs. */
const MIGRATE_V3_SQL = `
ALTER TABLE workout_logs ADD COLUMN duration_seconds INTEGER;
ALTER TABLE workout_logs ADD COLUMN rest_seconds INTEGER;
`;

/**
 * v3 → v4: each exercise can have one how-to video (relative path in the
 * document directory). Photos on workout days were dropped in favor of these.
 */
const MIGRATE_V4_SQL = `
ALTER TABLE template_exercises ADD COLUMN video_path TEXT;
DROP TABLE log_photos;
`;

/**
 * v1 → v2: adds 'missed' to the status CHECK (SQLite can't alter a CHECK, so the
 * table is rebuilt and rows copied), a one-log-per-date index, and the breaks table.
 * Order matters: build new, copy, drop old, rename new. Renaming the old table
 * instead would re-point log_sets' foreign key at the copy that then gets dropped.
 */
const MIGRATE_V2_SQL = `
${workoutLogsSql('workout_logs_new')}
INSERT INTO workout_logs_new SELECT * FROM workout_logs;
DROP TABLE workout_logs;
ALTER TABLE workout_logs_new RENAME TO workout_logs;
${LOGS_DATE_INDEX_SQL}
${BREAKS_SQL}
`;

/**
 * Prepares the database for use: creates or migrates the schema, then makes
 * sure every default setting exists (new keys arrive with app updates).
 * @returns Resolves once the database is ready
 */
export async function initDb(): Promise<void> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let version = row?.user_version ?? 0;

  if (version === 1) {
    // Foreign keys must be off while workout_logs is rebuilt, or dropping the old table would cascade-delete log_sets.
    await db.execAsync('PRAGMA foreign_keys = OFF;');
    // Atomic: a half-finished rebuild would lose logs.
    await db.withExclusiveTransactionAsync(async (txn) => {
      await txn.execAsync(MIGRATE_V2_SQL);
      await txn.execAsync('PRAGMA user_version = 2');
    });
    version = 2;
  }

  // Foreign keys are off by default in SQLite and must be enabled per connection, outside any transaction.
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

  // Atomic: a crash halfway through must not leave half a schema that the version check would then skip.
  await db.withExclusiveTransactionAsync(async (txn) => {
    // SCHEMA_SQL is the v2 shape; later versions are applied as steps, so new and upgraded installs end up identical.
    if (version === 0) {
      await txn.execAsync(SCHEMA_SQL);
      version = 2;
    }
    if (version === 2) {
      await txn.execAsync(MIGRATE_V3_SQL);
      version = 3;
    }
    if (version === 3) await txn.execAsync(MIGRATE_V4_SQL);
    await txn.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION}`);
    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
      await txn.runAsync('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)', key, value);
    }
  });
}

// ─── Settings ────────────────────────────────────────────────────────────────

/**
 * Reads one setting row.
 * @param key - Setting key
 * @returns The stored value, or null if the row is missing
 */
export async function getSettingValue(key: SettingKey): Promise<string | null> {
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM settings WHERE key = ?', key);
  return row?.value ?? null;
}

/**
 * Inserts or replaces one setting row.
 * @param key - Setting key
 * @param value - Value to store, already serialized to a string
 */
export async function setSettingValue(key: SettingKey, value: string): Promise<void> {
  await db.runAsync('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', key, value);
}

/**
 * Reads every setting at once, used to hydrate the app store on launch.
 * @returns Map of key to stored value
 */
export async function getAllSettings(): Promise<Partial<Record<SettingKey, string>>> {
  const rows = await db.getAllAsync<{ key: SettingKey; value: string }>('SELECT key, value FROM settings');
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

// ─── Workout templates ───────────────────────────────────────────────────────

export type TemplateSummary = { id: number; name: string; exercise_count: number };
export type TemplateExercise = { id: number; name: string; sort_order: number; video_path: string | null };
export type Template = { id: number; name: string; notes: string | null; created_at: string; exercises: TemplateExercise[] };
export type TemplateInput = { id?: number; name: string; notes: string | null; exercises: { name: string; video_path: string | null }[] };

/**
 * Lists every template with how many exercises it has, alphabetically.
 * @returns Template summaries
 */
export async function listTemplates(): Promise<TemplateSummary[]> {
  return db.getAllAsync<TemplateSummary>(
    `SELECT t.id, t.name, COUNT(e.id) AS exercise_count
     FROM workout_templates t LEFT JOIN template_exercises e ON e.template_id = t.id
     GROUP BY t.id ORDER BY t.name COLLATE NOCASE`,
  );
}

/**
 * Loads one template with its exercises in display order.
 * @param id - Template id
 * @returns The template, or null if it no longer exists
 */
export async function getTemplate(id: number): Promise<Template | null> {
  const t = await db.getFirstAsync<Omit<Template, 'exercises'>>('SELECT * FROM workout_templates WHERE id = ?', id);
  if (!t) return null;
  const exercises = await db.getAllAsync<TemplateExercise>(
    'SELECT id, name, sort_order, video_path FROM template_exercises WHERE template_id = ? ORDER BY sort_order',
    id,
  );
  return { ...t, exercises };
}

/**
 * Creates or updates a template and replaces its exercise list.
 * Past logs are unaffected: they store their own copies of names.
 * @param input - Template fields; include id to update, omit to create
 * @returns The template id
 */
export async function saveTemplate(input: TemplateInput): Promise<number> {
  let id = input.id ?? 0;
  // Atomic: the template row and its exercise list must never be saved half-way.
  await db.withExclusiveTransactionAsync(async (txn) => {
    if (input.id) {
      await txn.runAsync('UPDATE workout_templates SET name = ?, notes = ? WHERE id = ?', input.name, input.notes, input.id);
      await txn.runAsync('DELETE FROM template_exercises WHERE template_id = ?', input.id);
    } else {
      const r = await txn.runAsync(
        'INSERT INTO workout_templates (name, notes, created_at) VALUES (?, ?, ?)',
        input.name, input.notes, new Date().toISOString(),
      );
      id = r.lastInsertRowId;
    }
    for (const [i, ex] of input.exercises.entries()) {
      await txn.runAsync('INSERT INTO template_exercises (template_id, name, sort_order, video_path) VALUES (?, ?, ?, ?)', id, ex.name, i, ex.video_path);
    }
  });
  return id;
}

/**
 * Deletes a template. Its exercises and schedule entries cascade away;
 * past logs keep their copied name and get template_id = NULL.
 * @param id - Template id
 */
export async function deleteTemplate(id: number): Promise<void> {
  await db.runAsync('DELETE FROM workout_templates WHERE id = ?', id);
}

/**
 * Days of the week a template is actively scheduled on, used to warn before deleting.
 * @param templateId - Template id
 * @returns day_of_week values (0 = Sunday)
 */
export async function getScheduledDaysForTemplate(templateId: number): Promise<number[]> {
  const rows = await db.getAllAsync<{ day_of_week: number }>(
    'SELECT day_of_week FROM schedule_entries WHERE template_id = ? AND active = 1 ORDER BY day_of_week',
    templateId,
  );
  return rows.map((r) => r.day_of_week);
}

// ─── Weekly schedule ─────────────────────────────────────────────────────────

export type ScheduleDay = { day_of_week: number; template_id: number; template_name: string };

/**
 * The active weekly schedule with each day's current template name.
 * @returns One entry per scheduled day (rest days are absent)
 */
export async function getSchedule(): Promise<ScheduleDay[]> {
  return db.getAllAsync<ScheduleDay>(
    `SELECT s.day_of_week, s.template_id, t.name AS template_name
     FROM schedule_entries s JOIN workout_templates t ON t.id = s.template_id
     WHERE s.active = 1 ORDER BY s.day_of_week`,
  );
}

/**
 * Assigns a template to a weekday, or clears it to a rest day.
 * Only the recurring rule changes; workout_logs are never touched.
 * @param dayOfWeek - 0 = Sunday … 6 = Saturday
 * @param templateId - Template to assign, or null for a rest day
 */
export async function setScheduleDay(dayOfWeek: number, templateId: number | null): Promise<void> {
  // Atomic: clearing the old entry and inserting the new one must not leave the day empty or doubled (one workout per day in v1).
  await db.withExclusiveTransactionAsync(async (txn) => {
    await txn.runAsync('DELETE FROM schedule_entries WHERE day_of_week = ?', dayOfWeek);
    if (templateId !== null) {
      await txn.runAsync('INSERT INTO schedule_entries (template_id, day_of_week, active) VALUES (?, ?, 1)', templateId, dayOfWeek);
    }
  });
}

// ─── Workout logs ────────────────────────────────────────────────────────────

export type LogStatus = 'completed' | 'skipped' | 'missed';
export type LogSummary = {
  id: number;
  template_id: number | null;
  template_name: string;
  date: string;
  status: LogStatus;
  notes: string | null;
  /** 1 when a missed log falls inside an explained break. */
  excused: number;
  /** Total workout time and the part spent resting, for completed workouts tracked with the timer. */
  duration_seconds: number | null;
  rest_seconds: number | null;
};

/** SQL fragment: 1 if the log's date is inside any break. */
const EXCUSED_SQL = 'EXISTS (SELECT 1 FROM breaks b WHERE l.date BETWEEN b.start_date AND b.end_date)';

/**
 * Logs whose date falls in a range, oldest first.
 * @param from - First date, YYYY-MM-DD, inclusive
 * @param to - Last date, YYYY-MM-DD, inclusive
 * @returns Log summaries
 */
export async function getLogsBetween(from: string, to: string): Promise<LogSummary[]> {
  return db.getAllAsync<LogSummary>(
    `SELECT l.id, l.template_id, l.template_name, l.date, l.status, l.notes, l.duration_seconds, l.rest_seconds, ${EXCUSED_SQL} AS excused
     FROM workout_logs l WHERE l.date BETWEEN ? AND ? ORDER BY l.date`,
    from, to,
  );
}

/**
 * A template's most recent logs before a date, newest first, for the missed-in-a-row count.
 * @param templateId - Template id
 * @param before - YYYY-MM-DD, exclusive
 * @param limit - How many to read; the streak never needs more than a handful
 * @returns Log summaries
 */
export async function getTemplateHistory(templateId: number, before: string, limit = 20): Promise<LogSummary[]> {
  return db.getAllAsync<LogSummary>(
    `SELECT l.id, l.template_id, l.template_name, l.date, l.status, l.notes, l.duration_seconds, l.rest_seconds, ${EXCUSED_SQL} AS excused
     FROM workout_logs l WHERE l.template_id = ? AND l.date < ? ORDER BY l.date DESC LIMIT ?`,
    templateId, before, limit,
  );
}

/**
 * Every missed log not covered by a break, plus the dates of every completed or
 * skipped log, from a date on. Used to find whole weeks that were missed.
 * @param from - YYYY-MM-DD, inclusive
 * @returns Unexcused missed dates and active (completed/skipped) dates
 */
export async function getMissedAndActiveDates(from: string): Promise<{ missed: string[]; active: string[] }> {
  const rows = await db.getAllAsync<{ date: string; status: LogStatus; excused: number }>(
    `SELECT l.date, l.status, ${EXCUSED_SQL} AS excused FROM workout_logs l WHERE l.date >= ? ORDER BY l.date`,
    from,
  );
  return {
    missed: rows.filter((r) => r.status === 'missed' && !r.excused).map((r) => r.date),
    active: rows.filter((r) => r.status !== 'missed').map((r) => r.date),
  };
}

/**
 * Earliest unexcused missed date, the starting point for the missed-weeks check.
 * @returns YYYY-MM-DD, or null if nothing is missed
 */
export async function getEarliestUnexcusedMiss(): Promise<string | null> {
  const row = await db.getFirstAsync<{ date: string | null }>(
    `SELECT MIN(l.date) AS date FROM workout_logs l WHERE l.status = 'missed' AND NOT ${EXCUSED_SQL}`,
  );
  return row?.date ?? null;
}

/**
 * Records past scheduled days that were never logged as 'missed', and advances
 * the checked-through marker in the same step.
 * @param days - Missed days to record
 * @param through - Last date now checked, YYYY-MM-DD
 */
export async function recordMissedDays(days: { date: string; template_id: number; template_name: string }[], through: string): Promise<void> {
  // Atomic: the marker must only move forward if the missed rows were written, or days would be skipped forever.
  await db.withExclusiveTransactionAsync(async (txn) => {
    const now = new Date().toISOString();
    for (const d of days) {
      // OR IGNORE: a date that already has a log (e.g. logged from another screen) keeps it.
      await txn.runAsync(
        `INSERT OR IGNORE INTO workout_logs (template_id, template_name, date, status, created_at) VALUES (?, ?, ?, 'missed', ?)`,
        d.template_id, d.template_name, d.date, now,
      );
    }
    await txn.runAsync(`INSERT OR REPLACE INTO settings (key, value) VALUES ('missed_checked_through', ?)`, through);
  });
}

/**
 * Saves a workout as skipped, with the reason in notes. Replaces any existing log for that date.
 * @param input - Template, date and reason
 */
export async function skipWorkout(input: { template_id: number | null; template_name: string; date: string; reason: string | null }): Promise<void> {
  await db.runAsync(
    `INSERT INTO workout_logs (template_id, template_name, date, status, notes, created_at) VALUES (?, ?, ?, 'skipped', ?, ?)
     ON CONFLICT(date) DO UPDATE SET status = 'skipped', notes = excluded.notes`,
    input.template_id, input.template_name, input.date, input.reason, new Date().toISOString(),
  );
}

export type LogDetail = LogSummary & { exercises: { name: string; sets: { reps: number | null; weight: number | null }[] }[] };

/**
 * One date's log with its sets grouped by exercise, in the order they were logged.
 * @param date - YYYY-MM-DD
 * @returns The log, or null if the date has none
 */
export async function getLogDetail(date: string): Promise<LogDetail | null> {
  const log = await db.getFirstAsync<LogSummary>(
    `SELECT l.id, l.template_id, l.template_name, l.date, l.status, l.notes, l.duration_seconds, l.rest_seconds, ${EXCUSED_SQL} AS excused FROM workout_logs l WHERE l.date = ?`,
    date,
  );
  if (!log) return null;
  const rows = await db.getAllAsync<{ exercise_name: string; reps: number | null; weight: number | null }>(
    'SELECT exercise_name, reps, weight FROM log_sets WHERE log_id = ? ORDER BY id',
    log.id,
  );
  const exercises: LogDetail['exercises'] = [];
  for (const r of rows) {
    let ex = exercises.find((e) => e.name === r.exercise_name);
    if (!ex) exercises.push((ex = { name: r.exercise_name, sets: [] }));
    ex.sets.push({ reps: r.reps, weight: r.weight });
  }
  return { ...log, exercises };
}

export type CompletedLogInput = {
  date: string;
  template_id: number | null;
  template_name: string;
  notes: string | null;
  exercises: { name: string; sets: { reps: number | null; weight: number | null }[] }[];
  /** Omit when editing; the original times are kept. */
  duration_seconds?: number;
  rest_seconds?: number;
};

/**
 * Saves a workout as completed with all its sets. Replaces whatever was logged
 * for that date (a skipped or missed day becomes completed; editing rewrites the sets).
 * Workout and exercise names are copied here, so later template edits never change this log.
 * @param input - The finished workout
 */
export async function saveCompletedLog(input: CompletedLogInput): Promise<void> {
  // Atomic: the log row and its sets must land together, or a crash would leave a completed workout with missing sets.
  await db.withExclusiveTransactionAsync(async (txn) => {
    await txn.runAsync(
      `INSERT INTO workout_logs (template_id, template_name, date, status, notes, duration_seconds, rest_seconds, created_at)
       VALUES (?, ?, ?, 'completed', ?, ?, ?, ?)
       ON CONFLICT(date) DO UPDATE SET status = 'completed', template_id = excluded.template_id, template_name = excluded.template_name,
         notes = excluded.notes,
         duration_seconds = COALESCE(excluded.duration_seconds, duration_seconds),
         rest_seconds = COALESCE(excluded.rest_seconds, rest_seconds)`,
      input.template_id, input.template_name, input.date, input.notes,
      input.duration_seconds ?? null, input.rest_seconds ?? null, new Date().toISOString(),
    );
    const row = await txn.getFirstAsync<{ id: number }>('SELECT id FROM workout_logs WHERE date = ?', input.date);
    if (!row) throw new Error('Workout log was not saved');
    await txn.runAsync('DELETE FROM log_sets WHERE log_id = ?', row.id);
    for (const ex of input.exercises) {
      for (const [i, set] of ex.sets.entries()) {
        await txn.runAsync(
          'INSERT INTO log_sets (log_id, exercise_name, set_number, reps, weight) VALUES (?, ?, ?, ?, ?)',
          row.id, ex.name, i + 1, set.reps, set.weight,
        );
      }
    }
  });
}

/**
 * Updates a log's notes (e.g. the reason on a skipped workout).
 * @param id - Log id
 * @param notes - New notes, or null to clear
 */
export async function updateLogNotes(id: number, notes: string | null): Promise<void> {
  await db.runAsync('UPDATE workout_logs SET notes = ? WHERE id = ?', notes, id);
}

// ─── Breaks ──────────────────────────────────────────────────────────────────

export type Break = { id: number; start_date: string; end_date: string; reason: string; created_at: string };

/**
 * Explains a stretch of missed time. Missed days inside it no longer count toward warnings.
 * @param start - YYYY-MM-DD, inclusive
 * @param end - YYYY-MM-DD, inclusive
 * @param reason - The user's reason, e.g. "Health, doctor's orders"
 */
export async function addBreak(start: string, end: string, reason: string): Promise<void> {
  await db.runAsync(
    'INSERT INTO breaks (start_date, end_date, reason, created_at) VALUES (?, ?, ?, ?)',
    start, end, reason, new Date().toISOString(),
  );
}

