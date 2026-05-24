import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { darkColors, lightColors, createStyles, ColorPalette } from './theme';

type ThemeMode = 'dark' | 'light';

type ThemeContextType = {
  mode: ThemeMode;
  colors: ColorPalette;
  styles: ReturnType<typeof createStyles>;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextType>({
  mode: 'dark',
  colors: darkColors,
  styles: createStyles(darkColors),
  toggleTheme: () => {},
});

const THEME_KEY = '@theme_mode';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>('light');

  useEffect(() => {
    AsyncStorage.getItem(THEME_KEY).then(saved => {
      if (saved === 'light' || saved === 'dark') setMode(saved);
    });
  }, []);

  const toggleTheme = () => {
    setMode(prev => {
      const next: ThemeMode = prev === 'dark' ? 'light' : 'dark';
      AsyncStorage.setItem(THEME_KEY, next);
      return next;
    });
  };

  const colors = mode === 'dark' ? darkColors : lightColors;
  const styles = createStyles(colors);

  return (
    <ThemeContext.Provider value={{ mode, colors, styles, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
