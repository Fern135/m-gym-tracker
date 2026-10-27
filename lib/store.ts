/**
 * @file store.ts
 * @description Zustand store holding the settings that screens render from
 * (unit label, theme, week start, rest time, sets per exercise), so a change in Settings re-renders everywhere.
 */
import { create } from 'zustand';
import { getDefaultSets, getFirstDayOfWeek, getRestSeconds, getTheme, getWeightUnit, setSetting, type FirstDayOfWeek, type ThemeSetting, type WeightUnit } from './settings';

type AppState = {
  ready: boolean;
  weightUnit: WeightUnit;
  theme: ThemeSetting;
  firstDayOfWeek: FirstDayOfWeek;
  restSeconds: number;
  defaultSets: number;
  /** Loads persisted settings into the store; call once after initDb. */
  hydrate: () => Promise<void>;
  setWeightUnit: (unit: WeightUnit) => Promise<void>;
  setTheme: (theme: ThemeSetting) => Promise<void>;
  setFirstDayOfWeek: (day: FirstDayOfWeek) => Promise<void>;
  setRestSeconds: (secs: number) => Promise<void>;
  setDefaultSets: (sets: number) => Promise<void>;
};

/**
 * Global app store hook.
 * @returns The selected slice of app state
 */
export const useAppStore = create<AppState>((set) => ({
  ready: false,
  weightUnit: 'lbs',
  theme: 'system',
  firstDayOfWeek: 1,
  restSeconds: 90,
  defaultSets: 3,

  hydrate: async () => {
    const [weightUnit, theme, firstDayOfWeek, restSeconds, defaultSets] = await Promise.all([
      getWeightUnit(), getTheme(), getFirstDayOfWeek(), getRestSeconds(), getDefaultSets(),
    ]);
    set({ weightUnit, theme, firstDayOfWeek, restSeconds, defaultSets, ready: true });
  },
  setWeightUnit: async (weightUnit) => {
    await setSetting('weight_unit', weightUnit);
    set({ weightUnit });
  },
  setTheme: async (theme) => {
    await setSetting('theme', theme);
    set({ theme });
  },
  setFirstDayOfWeek: async (firstDayOfWeek) => {
    await setSetting('first_day_of_week', String(firstDayOfWeek));
    set({ firstDayOfWeek });
  },
  setRestSeconds: async (restSeconds) => {
    await setSetting('rest_seconds', String(restSeconds));
    set({ restSeconds });
  },
  setDefaultSets: async (defaultSets) => {
    await setSetting('default_sets', String(defaultSets));
    set({ defaultSets });
  },
}));
