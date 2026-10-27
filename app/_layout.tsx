/**
 * @file _layout.tsx
 * @description Root layout. Loads fonts, initializes the database and settings,
 * sets up notifications, then provides the Paper and navigation themes to every screen.
 */
import { Barlow_400Regular, Barlow_500Medium } from '@expo-google-fonts/barlow';
import { BarlowCondensed_600SemiBold, BarlowCondensed_700Bold } from '@expo-google-fonts/barlow-condensed';
import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { useColorScheme, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { PaperProvider, Text } from 'react-native-paper';
import { initDb } from '../lib/db';
import { setupNotifications } from '../lib/notifications';
import { useAppStore } from '../lib/store';
import { darkTheme, lightTheme } from '../lib/theme';

/**
 * App root: blocks rendering until fonts and the database are ready.
 * @returns The themed navigation stack
 */
export default function RootLayout() {
  const [fontsLoaded] = useFonts({ Barlow_400Regular, Barlow_500Medium, BarlowCondensed_600SemiBold, BarlowCondensed_700Bold });
  const [dbError, setDbError] = useState<string | null>(null);
  const ready = useAppStore((s) => s.ready);
  const themeSetting = useAppStore((s) => s.theme);
  const system = useColorScheme();

  useEffect(() => {
    initDb()
      .then(() => useAppStore.getState().hydrate())
      .then(() => { setupNotifications(); }) // not awaited: the app shouldn't wait on the permission prompt
      .catch((e: unknown) => setDbError(e instanceof Error ? e.message : String(e)));
  }, []);

  const dark = themeSetting === 'dark' || (themeSetting === 'system' && system === 'dark');
  const paper = dark ? darkTheme : lightTheme;
  const nav = dark ? DarkTheme : DefaultTheme;
  const navTheme = {
    ...nav,
    colors: { ...nav.colors, primary: paper.colors.primary, background: paper.colors.background, card: paper.colors.surface, text: paper.colors.onSurface, border: paper.colors.outlineVariant },
  };

  if (dbError) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', padding: 24, backgroundColor: paper.colors.background }}>
        <Text style={{ color: paper.colors.onSurface }}>Ironweek couldn&apos;t open its database: {dbError}. Restart the app; if this keeps happening, reinstall it.</Text>
      </View>
    );
  }
  if (!fontsLoaded || !ready) return <View style={{ flex: 1, backgroundColor: paper.colors.background }} />;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <PaperProvider theme={paper}>
        <ThemeProvider value={navTheme}>
          <StatusBar style={dark ? 'light' : 'dark'} />
          <Stack screenOptions={{ headerTitleStyle: { fontFamily: paper.fonts.titleLarge.fontFamily }, headerBackTitle: 'Back' }}>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          </Stack>
        </ThemeProvider>
      </PaperProvider>
    </GestureHandlerRootView>
  );
}
