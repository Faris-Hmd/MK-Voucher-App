import { StyleSheet } from 'react-native';

export const colors = {
  background: '#030305',
  foreground: '#f8fafc',
  primary: '#06b6d4',
  primaryHover: '#0891b2',
  accent: '#d946ef',
  secondary: '#0f1015',
  cardBg: 'rgba(15, 16, 21, 0.8)',
  glassBorder: 'rgba(255, 255, 255, 0.08)',
  textMuted: '#94a3b8'
};

export const globalStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingTop: 50,
  },
  content: {
    padding: 20,
    flex: 1,
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: colors.primary,
    marginBottom: 20,
  },
  card: {
    backgroundColor: colors.cardBg,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    marginBottom: 20,
  },
  label: {
    color: colors.textMuted,
    fontSize: 14,
    marginBottom: 8,
    textTransform: 'uppercase',
    fontWeight: '600'
  },
  input: {
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: 8,
    color: colors.foreground,
    padding: 15,
    fontSize: 16,
    marginBottom: 15,
  },
  button: {
    backgroundColor: colors.primary,
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
  }
});
