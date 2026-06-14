import { StyleSheet } from 'react-native';

export type ColorPalette = {
  background: string;
  foreground: string;
  primary: string;
  primaryHover: string;
  accent: string;
  secondary: string;
  cardBg: string;
  glassBorder: string;
  textMuted: string;
  inputBg: string;
};

export const darkColors: ColorPalette = {
  background: '#141414',
  foreground: '#ececec',
  primary: '#3b82f6',
  primaryHover: '#2563eb',
  accent: '#22c55e',
  secondary: '#242424',
  cardBg: '#1e1e1e',
  glassBorder: 'rgba(255, 255, 255, 0.08)',
  textMuted: '#8e9196',
  inputBg: '#242424',
};

export const lightColors: ColorPalette = {
  background: '#ffffff',
  foreground: '#171717',
  primary: '#171717',
  primaryHover: '#000000',
  accent: '#22c55e',
  secondary: '#f5f5f5',
  cardBg: '#ffffff',
  glassBorder: 'rgba(0, 0, 0, 0.08)',
  textMuted: '#737373',
  inputBg: '#f5f5f5',
};

// Legacy export so any file not yet using the context still compiles
export const colors = darkColors;

export const createStyles = (c: ColorPalette) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: c.background,
  },
  content: {
    padding: 20,
    flex: 1,
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    color: c.foreground,
    marginBottom: 16,
  },
  card: {
    backgroundColor: c.cardBg,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: c.glassBorder,
    marginBottom: 16,
  },
  label: {
    color: c.textMuted,
    fontSize: 12,
    marginBottom: 6,
    fontWeight: '500',
  },
  input: {
    backgroundColor: c.inputBg,
    borderWidth: 1,
    borderColor: c.glassBorder,
    borderRadius: 10,
    color: c.foreground,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontSize: 14,
    marginBottom: 12,
  },
  button: {
    backgroundColor: c.primary,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
});

// Static fallback (dark) styles for legacy imports
export const globalStyles = createStyles(darkColors);
