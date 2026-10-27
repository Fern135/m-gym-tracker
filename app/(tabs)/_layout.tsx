/**
 * @file (tabs)/_layout.tsx
 * @description Bottom tab navigator for the five main screens.
 */
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Tabs } from 'expo-router/js-tabs';
import type { ComponentProps } from 'react';
import { useTheme } from 'react-native-paper';

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

const TABS: { name: string; title: string; icon: IconName }[] = [
  { name: 'today', title: 'Today', icon: 'calendar-today' },
  { name: 'history', title: 'History', icon: 'history' },
  { name: 'templates', title: 'Workouts', icon: 'dumbbell' },
  { name: 'schedule', title: 'Schedule', icon: 'calendar-week' },
  { name: 'settings', title: 'Settings', icon: 'cog-outline' },
];

/**
 * Tab bar layout.
 * @returns The tabs navigator
 */
export default function TabsLayout() {
  const { colors, fonts } = useTheme();
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.onSurfaceVariant,
        tabBarLabelStyle: { fontFamily: fonts.labelMedium.fontFamily },
        headerTitleStyle: { fontFamily: fonts.headlineSmall.fontFamily, fontSize: 26 },
      }}
    >
      {TABS.map((t) => (
        <Tabs.Screen
          key={t.name}
          name={t.name}
          options={{ title: t.title, tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name={t.icon} color={color as string} size={size} /> }}
        />
      ))}
    </Tabs>
  );
}
