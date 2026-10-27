/**
 * @file history.tsx
 * @description Past workout logs, newest first. Placeholder until its build batch.
 */
import { View } from 'react-native';
import { useTheme } from 'react-native-paper';
import { EmptyState } from '../../components/EmptyState';

/**
 * @returns The history screen
 */
export default function HistoryScreen() {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <EmptyState icon="history" title="No workouts logged" body="Completed and skipped workouts will show up here." />
    </View>
  );
}
