// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { Palette } from '../src/app/Palette';

describe('navigation des résultats de la palette', () => {
  it('garde le focus dans le champ et exécute le résultat choisi au clavier', async () => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    const host = document.createElement('div');
    const panel = document.createElement('div');
    document.body.append(host, panel);
    const root = createRoot(host);
    const first = vi.fn();
    const second = vi.fn();
    await act(async () =>
      root.render(
        <Palette
          commands={[
            { label: 'Alpha', action: first },
            { label: 'Beta', action: second },
          ]}
          open
          onOpen={() => {}}
          onClose={() => {}}
          searchScope="project"
          onTextSearch={() => {}}
          onNextMatch={() => {}}
          panel={panel}
        />,
      ),
    );
    const input = panel.querySelector('input')!;
    expect(document.activeElement).toBe(input);
    await act(async () =>
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })),
    );
    expect(input.getAttribute('aria-activedescendant')).toBe('palette-result-1');
    expect(document.activeElement).toBe(input);
    await act(async () =>
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })),
    );
    expect(second).toHaveBeenCalledOnce();
    expect(first).not.toHaveBeenCalled();
    await act(async () => root.unmount());
    host.remove();
    panel.remove();
  });
});

it('navigates to a manuscript hit without closing or resetting the query', async () => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement('div'),
    panel = document.createElement('div');
  document.body.append(host, panel);
  const root = createRoot(host),
    onMatch = vi.fn(),
    onClose = vi.fn();
  const matches = [0, 1].map((i) => ({
    key: String(i),
    section: 'text' + i,
    title: 'Texte ' + i,
    from: i * 20,
    to: i * 20 + 4,
    excerpt: 'La lune',
  }));
  try {
    await act(async () =>
      root.render(
        <Palette
          commands={[]}
          open
          textSearch
          initialQuery="lune"
          matches={matches}
          matchTotal={2}
          onMatch={onMatch}
          onOpen={() => {}}
          onClose={onClose}
          searchScope="project"
          onTextSearch={() => {}}
          onNextMatch={() => {}}
          panel={panel}
        />,
      ),
    );
    const input = panel.querySelector('input')!;
    await act(async () =>
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })),
    );
    expect(input.getAttribute('aria-activedescendant')).toBe('manuscript-result-1');
    await act(async () =>
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })),
    );
    expect(onMatch).toHaveBeenCalledWith(matches[1]);
    expect(onClose).not.toHaveBeenCalled();
    expect(input.value).toBe('lune');
  } finally {
    await act(async () => root.unmount());
    host.remove();
    panel.remove();
  }
});
