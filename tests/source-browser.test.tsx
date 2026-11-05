// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { SourceBrowser } from '../src/sources/Browser';
const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('../src/platform/client', () => ({ request }));
it('browses types and scopes entities by vault without a sidebar search field', async () => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  request.mockImplementation(async (action: string, args: { vault?: string; kind?: string }) =>
    action === 'vaults'
      ? [
          { id: 'owned', name: 'Ariane', owned: true },
          { id: 'external', name: 'Recherche', owned: false },
        ]
      : {
          kinds: ['Personne'],
          types: [{ kind: 'Personne', count: 1 }],
          folders: [],
          total: 1,
          items: args.kind
            ? [
                {
                  id: args.vault || 'owned',
                  title: args.vault ? 'Camille' : 'Élise',
                  kind: 'Personne',
                  path: 'people.md',
                  vaultId: args.vault || 'owned',
                },
              ]
            : [],
        },
  );
  const host = document.createElement('div'),
    root = createRoot(host),
    read = vi.fn();
  try {
    await act(async () => root.render(<SourceBrowser onRead={read} onManage={() => {}} />));
    expect(host.querySelector('input')).toBeNull();
    await act(async () => host.querySelector<HTMLButtonElement>('.entity-type-heading')!.click());
    expect(host.textContent).toContain('Élise');
    const select = host.querySelector('select')!;
    await act(async () => {
      select.value = 'external';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(host.textContent).not.toContain('Élise');
    await act(async () => host.querySelector<HTMLButtonElement>('.entity-type-heading')!.click());
    expect(request).toHaveBeenLastCalledWith('browseSources', {
      query: '',
      vault: 'external',
      kind: 'Personne',
      folder: null,
      offset: 0,
    });
    await act(async () => host.querySelector<HTMLButtonElement>('.entity-source')!.click());
    expect(read).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'external', title: 'Camille' }),
    );
  } finally {
    await act(async () => root.unmount());
  }
});
