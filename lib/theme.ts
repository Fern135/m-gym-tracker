/**
 * @file theme.ts
 * @description Ironweek's Paper themes. Colors come from bumper plates:
 * each plate color marks a workout status (green done, red skipped,
 * blue upcoming, yellow start). Barlow Condensed is used for headings, Barlow for body text.
 */
import { MD3DarkTheme, MD3LightTheme, configureFonts, type MD3Theme } from 'react-native-paper';

/** Status colors, shared by light and dark so a status always looks the same. */
export const plate = {
  green: '#2E9E5B',
  red: '#D23B33',
  blue: '#2F6FD6',
  yellow: '#E8B321',
} as const;

/** Font files loaded in the root layout. */
export const FONT = {
  body: 'Barlow_400Regular',
  medium: 'Barlow_500Medium',
  display: 'BarlowCondensed_700Bold',
  title: 'BarlowCondensed_600SemiBold',
} as const;

const base = configureFonts({ config: { fontFamily: FONT.body } });

/**
 * Points a font variant at a specific font file. Each weight is its own file,
 * so fontWeight stays '400' (Android falls back to the system font otherwise).
 * @param variant - The base variant to copy
 * @param fontFamily - Font file name
 * @returns The variant with the new family
 */
const withFont = (variant: (typeof base)['bodyLarge'], fontFamily: string) => ({ ...variant, fontFamily, fontWeight: '400' as const });

const fonts = {
  ...base,
  displayLarge: withFont(base.displayLarge, FONT.display),
  displayMedium: withFont(base.displayMedium, FONT.display),
  displaySmall: withFont(base.displaySmall, FONT.display),
  headlineLarge: withFont(base.headlineLarge, FONT.display),
  headlineMedium: withFont(base.headlineMedium, FONT.display),
  headlineSmall: withFont(base.headlineSmall, FONT.display),
  titleLarge: withFont(base.titleLarge, FONT.title),
  titleMedium: withFont(base.titleMedium, FONT.medium),
  titleSmall: withFont(base.titleSmall, FONT.medium),
  labelLarge: withFont(base.labelLarge, FONT.medium),
  labelMedium: withFont(base.labelMedium, FONT.medium),
  labelSmall: withFont(base.labelSmall, FONT.medium),
};

export const lightTheme: MD3Theme = {
  ...MD3LightTheme,
  fonts,
  roundness: 3,
  colors: {
    ...MD3LightTheme.colors,
    primary: plate.blue,
    onPrimary: '#FFFFFF',
    primaryContainer: '#D9E5F9',
    onPrimaryContainer: '#0E2E63',
    secondary: '#56606A',
    secondaryContainer: '#DCE1E5',
    onSecondaryContainer: '#1D2328',
    error: plate.red,
    background: '#E9ECEA',
    surface: '#F6F7F6',
    surfaceVariant: '#DDE1DF',
    onSurface: '#1D2125',
    onSurfaceVariant: '#4C555C',
    outline: '#9AA3A8',
    outlineVariant: '#C9CFCC',
    elevation: { ...MD3LightTheme.colors.elevation, level0: 'transparent', level1: '#F6F7F6', level2: '#F1F3F2', level3: '#ECEFED' },
  },
};

export const darkTheme: MD3Theme = {
  ...MD3DarkTheme,
  fonts,
  roundness: 3,
  colors: {
    ...MD3DarkTheme.colors,
    primary: '#6E9BEA',
    onPrimary: '#0A2350',
    primaryContainer: '#1F3E73',
    onPrimaryContainer: '#D9E5F9',
    secondary: '#AEB7BE',
    secondaryContainer: '#363C42',
    onSecondaryContainer: '#DCE1E5',
    error: '#EE6A62',
    background: '#1A1D20',
    surface: '#23272B',
    surfaceVariant: '#30353A',
    onSurface: '#E4E7E5',
    onSurfaceVariant: '#AEB5BA',
    outline: '#6B747A',
    outlineVariant: '#3A4045',
    elevation: { ...MD3DarkTheme.colors.elevation, level0: 'transparent', level1: '#23272B', level2: '#282C31', level3: '#2D3237' },
  },
};
