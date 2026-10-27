/**
 * @file settings.ts
 * @description Typed access to the settings key-value table. The rest of the
 * app reads and writes settings only through this file.
 */
import { DEFAULT_SETTINGS, getSettingValue, setSettingValue, type SettingKey } from './db';
import type { WorkoutDraft } from './workout';

export type WeightUnit = 'lbs' | 'kg';
export type ThemeSetting = 'system' | 'light' | 'dark';
export type FirstDayOfWeek = 0 | 1;
export type LeadTime = 'day_before' | '1_hour' | '30_min' | '15_min' | 'at_time' | 'evening_checkin';

/**
 * Reads a raw setting, falling back to its default if the row is missing.
 * @param key - Setting key
 * @returns The stored string value
 */
export async function getSetting(key: SettingKey): Promise<string> {
  return (await getSettingValue(key)) ?? DEFAULT_SETTINGS[key];
}

/**
 * Writes a raw setting.
 * @param key - Setting key
 * @param value - String value to store
 */
export async function setSetting(key: SettingKey, value: string): Promise<void> {
  await setSettingValue(key, value);
}

/**
 * @returns The weight unit label shown next to logged weights
 */
export async function getWeightUnit(): Promise<WeightUnit> {
  return (await getSetting('weight_unit')) === 'kg' ? 'kg' : 'lbs';
}

/**
 * @returns Whether workout notifications are switched on
 */
export async function getNotificationsEnabled(): Promise<boolean> {
  return (await getSetting('notifications_enabled')) === 'true';
}

/**
 * Parses the stored "HH:MM" workout time.
 * @returns Hour (0–23) and minute (0–59)
 */
export async function getWorkoutTime(): Promise<{ hour: number; minute: number }> {
  return parseTime(await getSetting('notification_workout_time'));
}

/**
 * @returns The enabled notification lead times
 */
export async function getLeadTimes(): Promise<LeadTime[]> {
  return parseLeadTimes(await getSetting('notification_lead_times'));
}

/**
 * @returns The theme preference
 */
export async function getTheme(): Promise<ThemeSetting> {
  const v = await getSetting('theme');
  return v === 'light' || v === 'dark' ? v : 'system';
}

/**
 * @returns 0 when weeks start on Sunday, 1 when they start on Monday
 */
export async function getFirstDayOfWeek(): Promise<FirstDayOfWeek> {
  return (await getSetting('first_day_of_week')) === '0' ? 0 : 1;
}

/**
 * @returns Rest timer length in seconds (15–600)
 */
export async function getRestSeconds(): Promise<number> {
  const n = Number(await getSetting('rest_seconds'));
  return Number.isFinite(n) ? Math.min(600, Math.max(15, n)) : 90;
}

/**
 * @returns Target sets per exercise (1–10)
 */
export async function getDefaultSets(): Promise<number> {
  const n = Number(await getSetting('default_sets'));
  return Number.isInteger(n) ? Math.min(10, Math.max(1, n)) : 3;
}

/**
 * @returns The workout in progress, or null if none (or the stored JSON is unreadable)
 */
export async function getWorkoutDraft(): Promise<WorkoutDraft | null> {
  try {
    const raw = await getSetting('workout_draft');
    return raw ? (JSON.parse(raw) as WorkoutDraft) : null;
  } catch {
    return null;
  }
}

/**
 * Saves or clears the workout in progress.
 * @param draft - The draft, or null once it's completed or discarded
 */
export async function setWorkoutDraft(draft: WorkoutDraft | null): Promise<void> {
  await setSetting('workout_draft', draft ? JSON.stringify(draft) : '');
}

/**
 * Parses an "HH:MM" string, falling back to 08:00 if it is malformed.
 * @param value - Time string in 24-hour format
 * @returns Hour and minute
 */
export function parseTime(value: string): { hour: number; minute: number } {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value);
  const hour = m ? Number(m[1]) : NaN;
  const minute = m ? Number(m[2]) : NaN;
  return hour <= 23 && minute <= 59 ? { hour, minute } : { hour: 8, minute: 0 };
}

/**
 * Parses the stored JSON array of lead times, dropping unknown entries.
 * @param value - JSON string
 * @returns Valid lead times only
 */
export function parseLeadTimes(value: string): LeadTime[] {
  const valid: LeadTime[] = ['day_before', '1_hour', '30_min', '15_min', 'at_time', 'evening_checkin'];
  try {
    const arr: unknown = JSON.parse(value);
    return Array.isArray(arr) ? valid.filter((t) => arr.includes(t)) : [];
  } catch {
    return [];
  }
}
