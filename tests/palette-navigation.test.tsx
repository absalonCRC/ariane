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
            { id: 'alpha', label: 'Alpha', action: first },
            { id: 'beta', label: 'Beta', action: second },
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

it('moves between editor occurrences immediately without displaying a result list', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = document.createElement('div'),
    panel = document.createElement('div');
  document.body.append(host, panel);
  const root = createRoot(host),
    onNextMatch = vi.fn(),
    onTextSearch = vi.fn(),
    onClose = vi.fn();
  try {
    await act(async () =>
      root.render(
        <Palette
          commands={[]}
          open
          textSearch
          initialQuery="lune"
          onOpen={() => {}}
          onClose={onClose}
          searchScope="project"
          onTextSearch={onTextSearch}
          onNextMatch={onNextMatch}
          panel={panel}
        />,
      ),
    );
    const input = panel.querySelector('input')!;
    expect(onTextSearch).toHaveBeenCalledWith('lune');
    expect(input.getAttribute('role')).toBe('searchbox');
    expect(panel.querySelector('[role=listbox]')).toBeNull();
    await act(async () =>
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })),
    );
    expect(onNextMatch).toHaveBeenLastCalledWith('lune', false);
    await act(async () =>
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true })),
    );
    expect(onNextMatch).toHaveBeenLastCalledWith('lune', true);
    expect(document.activeElement).toBe(input);
    expect(onClose).not.toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount());
    host.remove();
    panel.remove();
  }
});
