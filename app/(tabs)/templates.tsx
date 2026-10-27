/**
 * @file templates.tsx
 * @description Lists workout templates with their exercise counts; tap one to
 * edit it, or use the button to create a new one.
 */
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, View } from 'react-native';
import { ActivityIndicator, FAB, List, useTheme } from 'react-native-paper';
import { EmptyState } from '../../components/EmptyState';
import { listTemplates, type TemplateSummary } from '../../lib/db';

/**
 * @returns The templates screen
 */
export default function TemplatesScreen() {
  const { colors } = useTheme();
  const [templates, setTemplates] = useState<TemplateSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Reload whenever the tab regains focus, so edits made on the detail screen show up.
  useFocusEffect(
    useCallback(() => {
      listTemplates()
        .then((t) => { setTemplates(t); setError(null); })
        .catch((e: unknown) => setError(String(e)));
    }, []),
  );

  const openNew = () => router.push('/workout/template/new');

  let body;
  if (error) body = <EmptyState icon="alert-circle-outline" title="Couldn't load workouts" body={error} />;
  else if (!templates) body = <ActivityIndicator style={{ flex: 1 }} />;
  else if (templates.length === 0)
    body = <EmptyState icon="dumbbell" title="No workouts yet" body="Create a workout like Upper Body and list its exercises." />;
  else
    body = (
      <FlatList
        data={templates}
        keyExtractor={(t) => String(t.id)}
        contentContainerStyle={{ paddingBottom: 96 }}
        ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: colors.outlineVariant, marginLeft: 16 }} />}
        renderItem={({ item }) => (
          <List.Item
            title={item.name}
            titleStyle={{ fontSize: 18 }}
            description={item.exercise_count === 1 ? '1 exercise' : `${item.exercise_count} exercises`}
            right={(p) => <List.Icon {...p} icon="chevron-right" />}
            onPress={() => router.push({ pathname: '/workout/template/[id]', params: { id: String(item.id) } })}
            style={{ backgroundColor: colors.surface }}
          />
        )}
      />
    );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {body}
      <FAB icon="plus" label="New workout" onPress={openNew} style={{ position: 'absolute', right: 16, bottom: 16 }} />
    </View>
  );
}
