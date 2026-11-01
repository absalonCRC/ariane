// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { useTheme } from '../src/app/useTheme';
import { ThemeSwitcher } from '../src/components/ThemeSwitcher';
it('follows the system until chosen explicitly, persists the switch, and restores it', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  localStorage.clear();
  let listener = () => {};
  const media = {
    matches: false,
    addEventListener: (_: string, fn: () => void) => {
      listener = fn;
    },
    removeEventListener: vi.fn(),
  };
  vi.stubGlobal('matchMedia', () => media);
  const host = document.createElement('div'),
    root = createRoot(host);
  let theme!: ReturnType<typeof useTheme>;
  function Harness() {
    theme = useTheme();
    return (
      <ThemeSwitcher
        dark={theme.dark}
        onChange={() => theme.change(theme.dark ? 'light' : 'dark')}
      />
    );
  }
  try {
    await act(async () => root.render(<Harness />));
    expect(document.documentElement.dataset.theme).toBe('light');
    await act(async () => {
      media.matches = true;
      listener();
    });
    expect(host.querySelector('button')?.getAttribute('aria-checked')).toBe('true');
    await act(async () => host.querySelector('button')!.click());
    expect(localStorage.getItem('ariane.theme')).toBe('light');
    await act(async () => listener());
    expect(theme.dark).toBe(false);
    await act(async () => root.render(null));
    await act(async () => root.render(<Harness />));
    expect(theme.theme).toBe('light');
    await act(async () => theme.change('system'));
    expect(document.documentElement.dataset.theme).toBe('dark');
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
    localStorage.clear();
    delete document.documentElement.dataset.theme;
  }
});
