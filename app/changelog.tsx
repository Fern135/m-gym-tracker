/**
 * @file changelog.tsx
 * @description "What's new": shows changelog.md, which ships inside the app
 * (see metro.config.js), as parsed by lib/changelog.ts. Bullets may use **bold**.
 */
import { Asset } from 'expo-asset';
import { File } from 'expo-file-system';
import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { ActivityIndicator, HelperText, Text, useTheme } from 'react-native-paper';
import { parseChangelog, type Entry } from '../lib/changelog';

/**
 * @returns The What's new screen
 */
export default function ChangelogScreen() {
  const { colors } = useTheme();
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro bundles .md as an asset; require is how assets are referenced
    Asset.loadAsync(require('../changelog.md'))
      .then(([asset]) => new File(asset.localUri ?? asset.uri).text())
      .then((md) => setEntries(parseChangelog(md)))
      .catch((e: unknown) => setError(`Couldn't load the changelog: ${e instanceof Error ? e.message : String(e)}`));
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack.Screen options={{ title: "What's new" }} />
      {error && <HelperText type="error">{error}</HelperText>}
      {!entries && !error && <ActivityIndicator style={{ marginTop: 32 }} />}
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48, gap: 24 }}>
        {entries?.map((e) => (
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
