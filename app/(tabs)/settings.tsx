/**
 * @file settings.tsx
 * @description Settings screen. Batch 1 shows the seeded values read back from
 * SQLite and lets you set week start and theme; the full screen arrives in batch 8.
 */
import { ScrollView } from 'react-native';
import { List, SegmentedButtons, useTheme } from 'react-native-paper';
import { useAppStore } from '../../lib/store';
import type { ThemeSetting } from '../../lib/settings';

/**
 * @returns The settings screen
 */
export default function SettingsScreen() {
  const { colors } = useTheme();
  const { weightUnit, theme, firstDayOfWeek, setTheme, setFirstDayOfWeek } = useAppStore();
  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={{ padding: 16, gap: 8 }}>
      <List.Item title="Weight unit" description={weightUnit} left={(p) => <List.Icon {...p} icon="weight-pound" />} />
      <List.Subheader>Week starts on</List.Subheader>
      <SegmentedButtons
        value={String(firstDayOfWeek)}
        onValueChange={(v) => setFirstDayOfWeek(v === '0' ? 0 : 1)}
        buttons={[
          { value: '1', label: 'Monday' },
          { value: '0', label: 'Sunday' },
        ]}
      />
      <List.Subheader>Theme</List.Subheader>
      <SegmentedButtons
        value={theme}
        onValueChange={(v) => setTheme(v as ThemeSetting)}
        buttons={[
          { value: 'system', label: 'System', icon: 'theme-light-dark' },
          { value: 'light', label: 'Light', icon: 'white-balance-sunny' },
          { value: 'dark', label: 'Dark', icon: 'weather-night' },
        ]}
      />
    </ScrollView>
  );
}
