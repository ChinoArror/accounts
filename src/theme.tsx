import React from 'react';
import { Moon, Sun } from 'lucide-react';

export const THEME_STORAGE_KEY = 'auth_center_theme';

export type ThemeMode = 'light' | 'dark';

export function getInitialTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'dark';

  const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (savedTheme === 'light' || savedTheme === 'dark') return savedTheme;

  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function useThemeMode(defaultTheme: ThemeMode = 'dark') {
  const [theme, setTheme] = React.useState<ThemeMode>(defaultTheme);

  React.useEffect(() => {
    setTheme(getInitialTheme());
  }, []);

  React.useEffect(() => {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  return { theme, setTheme };
}

export function ThemeToggle({ theme, onChange }: { theme: ThemeMode; onChange: (theme: ThemeMode) => void }) {
  return (
    <div className="ui-theme-toggle" role="group" aria-label="Color theme">
      {[
        { id: 'light' as const, icon: Sun, label: 'Light' },
        { id: 'dark' as const, icon: Moon, label: 'Dark' },
      ].map((option) => (
        <button
          key={option.id}
          type="button"
          data-active={theme === option.id}
          className="ui-theme-option"
          aria-pressed={theme === option.id}
          aria-label={`Switch to ${option.label.toLowerCase()} mode`}
          onClick={() => onChange(option.id)}
        >
          <option.icon className="w-4 h-4" />
          <span className="hidden sm:inline">{option.label}</span>
        </button>
      ))}
    </div>
  );
}
