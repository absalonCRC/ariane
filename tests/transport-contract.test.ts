// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import fixture from './fixtures/ipc-save.json';
import { request } from '../src/platform/client';
import type { Requests } from '../src/contracts/requests';

const patches = fixture.patches.map((patch) => ({
  ...patch,
  outline: { ...patch.outline, version: 1 as const },
}));

const invoke = vi.hoisted(() => vi.fn());
vi.mock('@tauri-apps/api/core', () => ({ invoke, isTauri: () => true }));

it('conserve le payload natif, les révisions et les offsets UTF-16 du manuscrit', async () => {
  const saved = { sections: [{ id: 'scene-test', revision: 8 }], mirrorErrors: [] };
  invoke.mockResolvedValueOnce(saved);
  const payload: Requests['save'] = { patches };
  expect(await request('save', payload)).toBe(saved);
  expect(invoke).toHaveBeenLastCalledWith('dispatch', { request: fixture });
  expect(fixture.patches[0].text.slice(0, fixture.patches[0].outline.nodes[1].start)).toBe(
    'Été 🌿\n',
  );
});

it('transmet les paramètres absents et propage les erreurs sans acquittement fictif', async () => {
  invoke.mockResolvedValueOnce(null);
  expect(await request('bootstrap')).toBeNull();
  expect(invoke).toHaveBeenLastCalledWith('dispatch', { request: { type: 'bootstrap' } });
  const failure = new Error('Le texte a changé depuis cette sauvegarde.');
  invoke.mockRejectedValueOnce(failure);
  await expect(request('save', { patches })).rejects.toBe(failure);
});
