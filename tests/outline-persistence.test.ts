// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { request } from '../src/platform/client';
import type { Outline } from '../src/contracts/project';

describe('sauvegarde des passages dans l’adaptateur navigateur', () => {
  beforeEach(() => localStorage.clear());
  it('rouvre les identités, les retours internes et une indentation sans frappe', async () => {
    const p = await request('create', { path: 'outline:test', name: 'Test' });
    const id = p.sections[0].id;
    const outline: Outline = {
      version: 1,
      nodes: [
        { id: 'a', parent: null, start: 0 },
        { id: 'b', parent: null, start: 4 },
      ],
    };
    await request('save', { patches: [{ id, revision: 0, text: 'a\nb\nc', outline }] });
    const indented: Outline = {
      version: 1,
      nodes: [outline.nodes[0], { ...outline.nodes[1], parent: 'a' }],
    };
    await request('save', { patches: [{ id, revision: 1, text: 'a\nb\nc', outline: indented }] });
    const loaded = await request('open', { path: p.path });
    expect(loaded.sections[0]).toMatchObject({ text: 'a\nb\nc', revision: 2, outline: indented });
  });
  it('refuse un lot invalide sans sauver la première partie', async () => {
    const p = await request('create', { path: 'outline:invalid', name: 'Test' });
    const id = p.sections[0].id;
    await expect(
      request('save', {
        patches: [
          { id, revision: 0, text: 'premier' },
          { id: 'inconnu', revision: 0, text: 'erreur' },
        ],
      }),
    ).rejects.toThrow();
    expect((await request('open', { path: p.path })).sections[0].text).toBe('');
    await expect(
      request('save', {
        patches: [
          {
            id,
            revision: 0,
            text: 'texte',
            outline: { version: 1, nodes: [{ id: 'a', parent: 'a', start: 0 }] },
          },
        ],
      }),
    ).rejects.toThrow();
  });
});
