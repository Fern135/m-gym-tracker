/**
 * @file export.ts
 * @description Exports every workout log as a JSON file and opens the share
 * sheet, so the user can save it to Files, email it, etc. Videos aren't included.
 */
import { File, Paths } from 'expo-file-system';
import { shareAsync } from 'expo-sharing';
import { getAllLogsForExport } from './db';
import { getWeightUnit } from './settings';
import { toDateStr } from './week';

/**
 * Writes all logs to a JSON file in the cache directory and shares it.
 * @throws If the file can't be written or sharing isn't available
 */
export async function exportLogs(): Promise<void> {
  const [logs, weight_unit] = await Promise.all([getAllLogsForExport(), getWeightUnit()]);
  const file = new File(Paths.cache, `ironweek-logs-${toDateStr(new Date())}.json`);
  file.create({ overwrite: true });
  await file.write(JSON.stringify({ app: 'Ironweek', exported_at: new Date().toISOString(), weight_unit, logs }, null, 2));
  await shareAsync(file.uri, { mimeType: 'application/json', UTI: 'public.json', dialogTitle: 'Export workout logs' });
}
