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
  background: '#030305',
  foreground: '#f8fafc',
  primary: '#06b6d4',
  primaryHover: '#0891b2',
  accent: '#d946ef',
  secondary: '#0f1015',
  cardBg: 'rgba(15, 16, 21, 0.85)',
  glassBorder: 'rgba(255, 255, 255, 0.08)',
  textMuted: '#94a3b8',
  inputBg: 'rgba(0,0,0,0.4)',
};

export const lightColors: ColorPalette = {
  background: '#f0f4f8',
  foreground: '#0f172a',
  primary: '#0891b2',
  primaryHover: '#0e7490',
  accent: '#c026d3',
  secondary: '#e2e8f0',
  cardBg: 'rgba(255, 255, 255, 0.95)',
  glassBorder: 'rgba(0, 0, 0, 0.08)',
  textMuted: '#64748b',
  inputBg: 'rgba(0,0,0,0.05)',
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
    fontSize: 32,
    fontWeight: '800',
    color: c.primary,
    marginBottom: 20,
  },
  card: {
    backgroundColor: c.cardBg,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: c.glassBorder,
    marginBottom: 20,
  },
  label: {
    color: c.textMuted,
    fontSize: 14,
    marginBottom: 8,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  input: {
    backgroundColor: c.inputBg,
    borderWidth: 1,
    borderColor: c.glassBorder,
    borderRadius: 8,
    color: c.foreground,
    padding: 15,
    fontSize: 16,
    marginBottom: 15,
  },
  button: {
    backgroundColor: c.primary,
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 10,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
});

// Static fallback (dark) styles for legacy imports
export const globalStyles = createStyles(darkColors);
