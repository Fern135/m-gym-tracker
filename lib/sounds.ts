/**
 * @file sounds.ts
 * @description The sounds you can pick in Settings for the rest alarm and the
 * evening-before reminder. Each file is bundled into the app by the
 * expo-notifications plugin in app.json, so add new ones there too.
 */
export type RestSound = 'classic' | 'digital' | 'rising' | 'bell';
export type ReminderSound = 'chime' | 'marimba' | 'system';

/** file is the bundled name notifications play; source is the same file for the in-app preview. */
export type SoundOption<T extends string> = { value: T; label: string; file: string | null; source: number | null };

export const REST_SOUNDS: SoundOption<RestSound>[] = [
  { value: 'classic', label: 'Classic alarm', file: 'rest_classic.wav', source: require('../assets/sounds/rest_classic.wav') },
  { value: 'digital', label: 'Digital watch', file: 'rest_digital.wav', source: require('../assets/sounds/rest_digital.wav') },
  { value: 'rising', label: 'Rising siren', file: 'rest_rising.wav', source: require('../assets/sounds/rest_rising.wav') },
  { value: 'bell', label: 'Ringing bell', file: 'rest_bell.wav', source: require('../assets/sounds/rest_bell.wav') },
];

export const REMINDER_SOUNDS: SoundOption<ReminderSound>[] = [
  { value: 'chime', label: 'Calendar chime', file: 'reminder_chime.wav', source: require('../assets/sounds/reminder_chime.wav') },
  { value: 'marimba', label: 'Soft marimba', file: 'reminder_marimba.wav', source: require('../assets/sounds/reminder_marimba.wav') },
  { value: 'system', label: 'Phone default', file: null, source: null },
];
