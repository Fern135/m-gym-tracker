/**
 * @file EmptyState.tsx
 * @description Centered icon + message shown when a screen has nothing to list yet.
 */
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ComponentProps, ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text, useTheme } from 'react-native-paper';

type Props = {
  icon: ComponentProps<typeof MaterialCommunityIcons>['name'];
  title: string;
  body: string;
  /** Optional call to action, e.g. a button. */
  children?: ReactNode;
};

/**
 * Empty-state block.
 * @param props - Icon, title, body text and optional action
 * @returns The rendered empty state
 */
export function EmptyState({ icon, title, body, children }: Props) {
  const { colors } = useTheme();
  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]}>
      <MaterialCommunityIcons name={icon} size={56} color={colors.outline} />
      <Text variant="headlineSmall" style={styles.center}>{title}</Text>
      <Text variant="bodyMedium" style={[styles.center, { color: colors.onSurfaceVariant }]}>{body}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 8 },
  center: { textAlign: 'center', maxWidth: 320 },
});
