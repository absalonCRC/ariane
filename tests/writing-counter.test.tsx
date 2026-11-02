// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { WritingCounter } from '../src/components/WritingCounter';
import { durations } from '../src/timer/pomodoro';
import { ControlHints } from '../src/components/ControlHints';

it('keeps adjacent buttons stationary until a pointer click is delivered', async () => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  const search = vi.fn();
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    setTimeout(callback, 0),
  );
  vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id));
  try {
    await act(async () => {
      root.render(
        <div className="bottom-controls">
          <WritingCounter
            words={4}
            characters={20}
            lines={2}
            notes={0}
            notesStatus="ready"
            mode="words"
            onChange={() => {}}
          />
          <button onClick={search}>Recherche</button>
        </div>,
      );
    });
    const counter = host.querySelector<HTMLButtonElement>('.counter-value')!;
    const searchButton = host.querySelector<HTMLButtonElement>('.bottom-controls > button')!;
    await act(async () => counter.focus());
    expect(counter.getAttribute('aria-expanded')).toBe('true');
    await act(async () => {
      searchButton.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
      searchButton.focus();
    });
    expect(counter.getAttribute('aria-expanded')).toBe('true');
    await act(async () => {
      searchButton.dispatchEvent(new MouseEvent('pointerup', { bubbles: true }));
      searchButton.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(search).toHaveBeenCalledOnce();
    expect(counter.getAttribute('aria-expanded')).toBe('false');
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});

it('offers icon-only count modes with accessible labels and tooltips', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.useFakeTimers();
  localStorage.removeItem('ariane.pomodoro.v1');
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  function Harness() {
    const [mode, setMode] = useState<'characters' | 'words' | 'lines'>('words');
    return (
      <>
        <ControlHints />
        <WritingCounter
          words={4}
          characters={20}
          lines={2}
          notes={0}
          notesStatus="ready"
          mode={mode}
          onChange={setMode}
        />
      </>
    );
  }
  try {
    await act(async () => root.render(<Harness />));
    const trigger = host.querySelector<HTMLButtonElement>('.counter-value')!;
    await act(async () => trigger.click());
    const modes = [...host.querySelectorAll<HTMLButtonElement>('.counter-mode')];
    expect(modes.map((button) => button.getAttribute('aria-label'))).toEqual([
      'Caractères', 'Mots', 'Lignes',
    ]);
    expect(modes.every((button) => !button.textContent && button.querySelector('svg'))).toBe(true);
    expect(modes[1].getAttribute('aria-pressed')).toBe('true');
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
      modes[0].focus();
      vi.advanceTimersByTime(0);
    });
    expect(document.querySelector('.control-hint')?.textContent).toBe('Caractères');
    await act(async () => modes[0].click());
    expect(modes[0].getAttribute('aria-pressed')).toBe('true');
    expect(trigger.textContent).toContain('20 caractères');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(trigger);
  } finally {
    await act(async () => root.unmount());
    host.remove();
    localStorage.removeItem('ariane.pomodoro.v1');
    vi.useRealTimers();
  }
});

it('tints the active timer through each phase and preserves its progress while paused', async () => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  const start = new Date('2026-11-02T12:00:00Z').getTime();
  vi.setSystemTime(start);
  localStorage.removeItem('ariane.pomodoro.v1');
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  try {
    await act(async () => {
      root.render(
        <WritingCounter
          words={4}
          characters={20}
          lines={2}
          notes={0}
          notesStatus="ready"
          mode="words"
          onChange={() => {}}
        />,
      );
    });
    const capsule = host.querySelector<HTMLDivElement>('.writing-counter')!;
    const hue = () => capsule.style.getPropertyValue('--timer-hue');
    const advanceTo = async (time: number) => {
      await act(async () => {
        vi.setSystemTime(time);
        document.dispatchEvent(new Event('visibilitychange'));
      });
    };
    expect(capsule.dataset.timerActive).toBe('false');
    expect(hue()).toBe('');
    await act(async () =>
      host.querySelector<HTMLButtonElement>('[aria-label="Démarrer le minuteur"]')!.click(),
    );
    expect(capsule.dataset.timerActive).toBe('true');
    expect(hue()).toBe('8deg');
    await advanceTo(start + durations.focus / 2);
    expect(hue()).toBe('74deg');
    await act(async () =>
      host.querySelector<HTMLButtonElement>('[aria-label="Mettre le minuteur en pause"]')!.click(),
    );
    const resume = start + durations.focus / 2 + 600_000;
    await advanceTo(resume);
    expect(capsule.dataset.timerActive).toBe('true');
    expect(hue()).toBe('74deg');
    await act(async () =>
      host.querySelector<HTMLButtonElement>('[aria-label="Démarrer le minuteur"]')!.click(),
    );
    await advanceTo(resume + durations.focus / 2 - 1000);
    expect(parseFloat(hue())).toBeGreaterThan(139);
    await advanceTo(resume + durations.focus / 2);
    expect(hue()).toBe('8deg');
    expect(capsule.textContent).toContain('pause 05:00');
    await act(async () =>
      host.querySelector<HTMLButtonElement>('[aria-label="Recommencer le cycle Pomodoro"]')!.click(),
    );
    expect(capsule.dataset.timerActive).toBe('false');
    expect(hue()).toBe('');
  } finally {
    await act(async () => root.unmount());
    host.remove();
    localStorage.removeItem('ariane.pomodoro.v1');
    vi.useRealTimers();
  }
});
