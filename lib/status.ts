/**
 * @file status.ts
 * @description Maps a day's state and warning to its color and short label,
 * so the week strip and the Today card always agree.
 */
import type { MD3Theme } from 'react-native-paper';
import { plate } from './theme';
import type { DayCard } from './week';

/**
 * Edge color for a day: green done, grey skipped/missed/break, blue upcoming,
 * yellow or red when the workout was missed before, neutral for rest days.
 * @param day - The day card
 * @param colors - Active theme colors
 * @returns A color string
 */
export function statusColor(day: Pick<DayCard, 'state' | 'warning'>, colors: MD3Theme['colors']): string {
  switch (day.state) {
    case 'completed': return plate.green;
    case 'upcoming': return day.warning === 2 ? plate.red : day.warning === 1 ? plate.yellow : plate.blue;
    case 'rest': return colors.outlineVariant;
    default: return colors.outline;
  }
}

/**
 * One-word status shown on a day card, so status never relies on color alone.
 * @param day - The day card
 * @returns Label text
 */
export function statusLabel(day: Pick<DayCard, 'state' | 'warning' | 'isToday'>): string {
  switch (day.state) {
    case 'completed': return 'Done';
    case 'skipped': return 'Skipped';
    case 'missed': return 'Missed';
    case 'break': return 'Break';
    case 'rest': return 'Rest';
    case 'untracked': return '';
    case 'upcoming':
      if (day.warning === 2) return 'Must do';
      if (day.warning === 1) return "Don't miss";
      return day.isToday ? 'Today' : 'Upcoming';
  }
}
