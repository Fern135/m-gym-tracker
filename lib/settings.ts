/**
 * @file settings.ts
 * @description Typed access to the settings key-value table. The rest of the
 * app reads and writes settings only through this file.
 */
import { DEFAULT_SETTINGS, getSettingValue, setSettingValue, type SettingKey } from './db';

export type WeightUnit = 'lbs' | 'kg';
export type ThemeSetting = 'system' | 'light' | 'dark';
export type FirstDayOfWeek = 0 | 1;
export type LeadTime = 'day_before' | '1_hour' | '30_min' | '15_min' | 'at_time';

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
  const valid: LeadTime[] = ['day_before', '1_hour', '30_min', '15_min', 'at_time'];
  try {
    const arr: unknown = JSON.parse(value);
    return Array.isArray(arr) ? valid.filter((t) => arr.includes(t)) : [];
  } catch {
    return [];
  }
}
