// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { request } from '../src/app/client';
import type { Source, Vault } from '../src/app/types';

describe('aperçu du vault Ariane', () => {
  beforeEach(() => localStorage.clear());
  it('prépare un vault et détecte une fiche créée dans le texte', async () => {
    await request('create', { path: 'browser:test', name: 'Test', vaultPath: null });
    const vaults = await request<Vault[]>('vaults');
    expect(vaults).toHaveLength(1);
    expect(vaults[0].owned).toBe(true);
    await request('createVaultEntity', {
      kind: 'personne',
      name: 'Marie Curie',
      description: 'Scientifique.',
    });
    const found = await request<Source[]>('suggest', { text: 'Marie Curie écrit.', depth: 0 });
    expect(found.map((item) => item.title)).toEqual(['Marie Curie']);
    expect((await request<Vault[]>('vaults'))[0].count).toBe(1);
    await expect(
      request('createVaultEntity', { kind: 'personne', name: 'Marie Curie', description: 'autre' }),
    ).rejects.toThrow();
  });
});
