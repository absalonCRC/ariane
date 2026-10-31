// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { WritingCounter } from '../src/components/WritingCounter';

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
