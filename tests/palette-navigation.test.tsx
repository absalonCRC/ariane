// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { Palette } from '../src/app/Palette';

describe('navigation des résultats de la palette', () => {
  it('garde le focus dans le champ et exécute le résultat choisi au clavier', async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const host = document.createElement('div');
    const panel = document.createElement('div');
    document.body.append(host, panel);
    const root = createRoot(host);
    const first = vi.fn();
    const second = vi.fn();
    await act(async () => root.render(<Palette commands={[{ label: 'Alpha', action: first }, { label: 'Beta', action: second }]} open onOpen={() => {}} onClose={() => {}} searchScope="project" onTextSearch={() => {}} onNextMatch={() => {}} panel={panel} />));
    const input = panel.querySelector('input')!;
    expect(document.activeElement).toBe(input);
    await act(async () => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })));
    expect(input.getAttribute('aria-activedescendant')).toBe('palette-result-1');
    expect(document.activeElement).toBe(input);
    await act(async () => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
    expect(second).toHaveBeenCalledOnce();
    expect(first).not.toHaveBeenCalled();
    await act(async () => root.unmount());
    host.remove(); panel.remove();
  });
});
