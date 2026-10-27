/**
 * @file settings.tsx
 * @description Settings screen. Batch 1 shows the seeded values read back from
 * SQLite and lets you set rest time, sets, week start and theme; the full screen arrives in batch 8.
 */
import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Button, IconButton, List, SegmentedButtons, Text, useTheme } from 'react-native-paper';
import { allowExactAlarms, exactAlarmsAllowed } from '../../lib/notifications';
import { formatClock } from '../../lib/workout';
import { useAppStore } from '../../lib/store';
import type { ThemeSetting } from '../../lib/settings';

/**
 * @returns The settings screen
 */
export default function SettingsScreen() {
  const { colors } = useTheme();
  const [exactOk, setExactOk] = useState<boolean | null>(null);
  useEffect(() => { exactAlarmsAllowed().then(setExactOk); }, []);
  const { weightUnit, theme, firstDayOfWeek, restSeconds, defaultSets, setTheme, setFirstDayOfWeek, setRestSeconds, setDefaultSets } = useAppStore();
  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={{ padding: 16, gap: 8 }}>
      <List.Item title="Weight unit" description={weightUnit} left={(p) => <List.Icon {...p} icon="weight-pound" />} />
      <List.Item
        title="Rest time"
        description="Length of the rest timer between sets"
        left={(p) => <List.Icon {...p} icon="timer-outline" />}
        right={() => (
          <Stepper label={formatClock(restSeconds)} onMinus={() => setRestSeconds(Math.max(15, restSeconds - 15))} onPlus={() => setRestSeconds(Math.min(600, restSeconds + 15))} what="rest time" />
        )}
      />
      <List.Item
        title="Sets per exercise"
        description="The countdown during a workout starts here"
        left={(p) => <List.Icon {...p} icon="counter" />}
        right={() => (
          <Stepper label={String(defaultSets)} onMinus={() => setDefaultSets(Math.max(1, defaultSets - 1))} onPlus={() => setDefaultSets(Math.min(10, defaultSets + 1))} what="sets per exercise" />
        )}
      />
      {exactOk === false && (
        <List.Item
          title="Rest alarm on time"
          description="Android may deliver the rest alert late while the phone is locked. Allow alarms to fix it."
          descriptionNumberOfLines={3}
          left={(p) => <List.Icon {...p} icon="alarm" />}
          right={() => <Button onPress={() => allowExactAlarms().then(setExactOk)}>Allow</Button>}
        />
      )}
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

/**
 * Minus / value / plus control for a numeric setting.
 * @param props - Displayed value, handlers, and what it adjusts (for screen readers)
 * @returns The stepper
 */
function Stepper({ label, onMinus, onPlus, what }: { label: string; onMinus: () => void; onPlus: () => void; what: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <IconButton icon="minus" size={18} mode="outlined" onPress={onMinus} accessibilityLabel={`Decrease ${what}`} />
      <Text variant="titleMedium" style={{ minWidth: 44, textAlign: 'center' }}>{label}</Text>
      <IconButton icon="plus" size={18} mode="outlined" onPress={onPlus} accessibilityLabel={`Increase ${what}`} />
    </View>
  );
}
