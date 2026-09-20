import { useColorScheme } from 'react-native';

export interface ThemeColors {
  background: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  text: string;
  textMuted: string;
  textFaint: string;
  primary: string;
  primaryText: string;
  success: string;
  successText: string;
  danger: string;
  warning: string;
  overlay: string;
}

const light: ThemeColors = {
  background: '#ffffff',
  surface: '#ffffff',
  surfaceAlt: '#f3f4f6',
  border: '#e5e7eb',
  text: '#111827',
  textMuted: '#6b7280',
  textFaint: '#9ca3af',
  primary: '#2563eb',
  primaryText: '#ffffff',
  success: '#16a34a',
  successText: '#ffffff',
  danger: '#ef4444',
  warning: '#b45309',
  overlay: 'rgba(0,0,0,0.4)',
};

const dark: ThemeColors = {
  background: '#0b0f1a',
  surface: '#151a26',
  surfaceAlt: '#1f2533',
  border: '#2b3140',
  text: '#f3f4f6',
  textMuted: '#9ca3af',
  textFaint: '#6b7280',
  primary: '#3b82f6',
  primaryText: '#ffffff',
  success: '#22c55e',
  successText: '#0b0f1a',
  danger: '#f87171',
  warning: '#fbbf24',
  overlay: 'rgba(0,0,0,0.6)',
};

export function useThemeColors(): ThemeColors {
  const scheme = useColorScheme();
  return scheme === 'dark' ? dark : light;
}

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
};

export const radius = {
  sm: 6,
  md: 8,
  lg: 10,
  xl: 12,
};
