/**
 * @file changelog.tsx
 * @description "What's new": shows changelog.md (copied into lib/changelog.content.ts by
 * scripts/sync-changelog.js), as parsed by lib/changelog.ts. Bullets may use **bold**.
 */
import { Stack } from 'expo-router';
import { ScrollView, View } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import { parseChangelog } from '../lib/changelog';
import changelog from '../lib/changelog.content';

const entries = parseChangelog(changelog);

/**
 * @returns The What's new screen
 */
export default function ChangelogScreen() {
  const { colors } = useTheme();

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack.Screen options={{ title: "What's new" }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48, gap: 24 }}>
        {entries.map((e) => (
          <View key={e.heading} style={{ gap: 8 }}>
            <Text variant="titleLarge">{e.heading}</Text>
            {e.bullets.map((b, i) => (
              <View key={i} style={{ flexDirection: 'row', gap: 8 }}>
                <Text variant="bodyLarge">•</Text>
                <Text variant="bodyLarge" style={{ flex: 1 }}>
                  {b.split('**').map((part, j) => (j % 2 ? <Text key={j} style={{ fontWeight: 'bold' }}>{part}</Text> : part))}
                </Text>
              </View>
            ))}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
