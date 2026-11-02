import { useLayoutEffect, useState } from 'react';
export type Theme = 'light' | 'dark' | 'system';
const key = 'ariane.theme';
export function savedTheme(): Theme {
  try {
    const value = localStorage.getItem(key);
    return value === 'light' || value === 'dark' ? value : 'system';
  } catch {
    return 'system';
  }
}
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(savedTheme);
  const [systemDark, setSystemDark] = useState(
    () => typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches,
  );
  const dark = theme === 'dark' || (theme === 'system' && systemDark);
  useLayoutEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const media = matchMedia('(prefers-color-scheme: dark)');
    const change = () => setSystemDark(media.matches);
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  }, [dark]);
  function change(value: Theme) {
    setTheme(value);
    try {
      localStorage.setItem(key, value);
    } catch {
      /* Theme still works for this session. */
    }
  }
  return { theme, dark, change };
}
