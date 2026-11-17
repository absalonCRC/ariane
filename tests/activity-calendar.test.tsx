// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { ActivityCalendar } from '../src/profile/ActivityCalendar';
import { WritingActivityStore } from '../src/profile/writingActivity';
it('shows real daily values, zero-word writing days, prior unknown days, and keyboard selection', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 10, 17, 12));
  const store = new WritingActivityStore({ getItem: () => null, setItem: () => {} }, vi.fn());
  store.record(12);
  store.record(-2);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(<ActivityCalendar activity={store} />));
    const today = host.querySelector<HTMLButtonElement>('[data-day="2026-11-17"]')!;
    expect(today.getAttribute('aria-label')).toContain('10 mots ajoutés nets');
    expect(host.querySelectorAll('[tabindex="0"]')).toHaveLength(1);
    await act(async () => {
      today.focus();
      today.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true }),
      );
    });
    expect(host.querySelector('[data-day="2026-11-10"]')).toBe(document.activeElement);
    expect(host.querySelector('[aria-live]')?.textContent).toContain('Avant le début du suivi');
    await act(async () => store.record(-10));
    expect(today.getAttribute('data-level')).toBe('1');
    expect(host.textContent).toContain('Jours d’écriture : 1 · Mots ajoutés nets : 0');
  } finally {
    await act(async () => root.unmount());
    host.remove();
    store.dispose();
    vi.useRealTimers();
  }
});
