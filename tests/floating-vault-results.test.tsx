// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { FloatingVaultResults } from '../src/sources/FloatingVaultResults';
import type { Source } from '../src/contracts/sources';
it('shows two compact cards and pins only after an explicit action', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = document.createElement('div'),
    root = createRoot(host),
    onPin = vi.fn();
  const sources = [0, 1, 2].map(
    (i) => ({ id: String(i), title: 'Fiche ' + i, kind: 'Lieu', text: 'Passage ' + i }) as Source,
  );
  const props = {
    query: 'ville',
    sources,
    busy: false,
    error: '',
    pinned: new Set<string>(),
    pinning: false,
    canPin: true,
    onOpen: vi.fn(),
    onPin,
  };
  try {
    await act(async () => root.render(<FloatingVaultResults {...props} />));
    expect(host.querySelectorAll('article')).toHaveLength(2);
    expect(onPin).not.toHaveBeenCalled();
    await act(async () => host.querySelector<HTMLButtonElement>('.vault-result-pin')!.click());
    expect(onPin).toHaveBeenCalledWith(sources[0]);
    await act(async () =>
      host.querySelector<HTMLButtonElement>('[aria-label="Fiches suivantes"]')!.click(),
    );
    expect(host.querySelectorAll('article')).toHaveLength(1);
    expect(host.textContent).toContain('Fiche 2');
    await act(async () => root.render(<FloatingVaultResults {...props} query="autre" />));
    expect(host.textContent).toContain('Fiche 0');
  } finally {
    await act(async () => root.unmount());
  }
});
