// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { Library } from '../src/sources/Library';
import type { Vault } from '../src/contracts/sources';

const { request, choosePath } = vi.hoisted(() => ({ request: vi.fn(), choosePath: vi.fn() }));
vi.mock('../src/platform/client', () => ({ native: true, request }));
vi.mock('../src/app/choosePath', () => ({ choosePath }));
vi.mock('@tauri-apps/api/event', () => ({ listen: async () => () => {} }));
vi.mock('@tauri-apps/api/webview', () => ({
  getCurrentWebview: () => ({ onDragDropEvent: async () => () => {} }),
}));

it('keeps a received source pending until the author chooses its folder', async () => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const refresh = vi.fn();
  const onError = vi.fn();
  let vault: Vault = {
    id: 'reference-du-vault',
    path: '/ancien-emplacement/Carnets',
    name: 'Carnets',
    scope: ['Fiches'],
    count: 0,
    available: false,
    needsAuthorization: true,
  };
  request.mockImplementation(async (action: string) => {
    if (action === 'vaults') return [vault];
    if (action === 'engineStatus') return { available: true };
    if (action === 'connectVault') {
      vault = { ...vault, path: '/local/Carnets', available: true, needsAuthorization: false };
      return [vault];
    }
    if (action === 'index') return { errors: [], semantic: false };
    throw new Error(action);
  });
  const button = (label: string) =>
    Array.from(host.querySelectorAll('button')).find((item) => item.textContent?.trim() === label);
  try {
    await act(async () => {
      root.render(
        <Library
          embedded
          projectPath="/atelier/Projet reçu"
          onClose={() => {}}
          onError={onError}
          onRefresh={refresh}
          onIndexProgress={() => {}}
          onBusy={() => {}}
        />,
      );
    });
    expect(host.textContent).toContain('Autorisation requise');
    expect(button('Actualiser l’index')?.disabled).toBe(true);
    expect(choosePath).not.toHaveBeenCalled();

    choosePath.mockResolvedValueOnce(null);
    await act(async () => button('Autoriser Carnets…')!.click());
    expect(request).not.toHaveBeenCalledWith('connectVault', expect.anything());
    expect(host.textContent).toContain('Autorisation requise');

    choosePath.mockResolvedValueOnce('/local/Carnets');
    await act(async () => button('Autoriser Carnets…')!.click());
    expect(request).toHaveBeenCalledWith('connectVault', {
      path: '/local/Carnets',
      projectPath: '/atelier/Projet reçu',
      vaultId: 'reference-du-vault',
    });
    expect(request).toHaveBeenCalledWith('index');
    expect(host.textContent).toContain('Lecture seule');
    expect(host.querySelector('textarea')?.value).toBe('Fiches');
    expect(button('Autoriser Carnets…')).toBeUndefined();
    expect(refresh).toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
