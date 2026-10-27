/**
 * @file log/[date].tsx
 * @description Workout screen for one date. Placeholder until batch 5 builds
 * the guided workout (sets, rest timer, next exercise).
 */
import { format, parseISO } from 'date-fns';
import { Stack, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { useTheme } from 'react-native-paper';
import { EmptyState } from '../../../components/EmptyState';

/**
 * @returns The placeholder workout screen
 */
export default function LogScreen() {
  const { date } = useLocalSearchParams<{ date: string }>();
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack.Screen options={{ title: format(parseISO(date), 'EEEE, MMM d') }} />
      <EmptyState icon="dumbbell" title="Workout screen coming next" body="Sets, reps, the rest timer and Next exercise arrive in batch 5." />
    </View>
  );
}
