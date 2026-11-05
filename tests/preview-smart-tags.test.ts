// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => false, invoke: vi.fn() }));
import { request } from '../src/platform/client';
afterEach(() => localStorage.clear());
it('keeps tags through reload, trash, scoped/full restore and isolated writing variants', async () => {
  const p = await request('create', { path: 'tags-test', name: 'Tags' });
  const projectPath = p.path,
    id = p.sections[0].id;
  const tag = { id: 'a', name: 'Enquête', color: '#72816a', category: 'Intrigue' };
  await request('smartTagOperation', { projectPath, operation: { action: 'save', tag } });
  await request('smartTagOperation', {
    projectPath,
    operation: { action: 'assign', section: id, tagIds: ['a'] },
  });
  await request('update', { section: { ...p.sections[0], title: 'Titre modifié' } });
  expect((await request('open', { path: projectPath })).sections[0].tagIds).toEqual(['a']);
  await request('save', {
    patches: [
      {
        id,
        revision: 0,
        text: 'Parent\nEnfant',
        outline: {
          version: 1,
          nodes: [
            { id: 'a-node', parent: null, start: 0, tagIds: ['a'] },
            { id: 'b-node', parent: 'a-node', start: 7 },
          ],
        },
      },
    ],
  });
  const full = await request('capture', { name: 'Complet' });
  const scoped = await request('capture', { name: 'Scène', scope: id });
  await request('libraryOperation', { operation: { action: 'trash', ids: [id] } });
  await request('smartTagOperation', { projectPath, operation: { action: 'delete', id: 'a' } });
  const restored = await request('restore', { id: scoped.id });
  expect(restored.sections[0].tagIds).toEqual(['a']);
  expect(restored.smartTags).toEqual([tag]);
  await request('smartTagOperation', {
    projectPath,
    operation: { action: 'save', tag: { ...tag, name: 'Autre' } },
  });
  expect((await request('restore', { id: full.id })).smartTags).toEqual([tag]);
  await request('createBranch', { projectPath, name: 'Variante' });
  const variant = (await request('historyState', { projectPath })).activeBranch;
  await request('smartTagOperation', {
    projectPath,
    operation: { action: 'save', tag: { ...tag, name: 'Variante' } },
  });
  expect((await request('switchBranch', { projectPath, id: 'main' })).smartTags).toEqual([tag]);
  expect((await request('switchBranch', { projectPath, id: variant })).smartTags?.[0].name).toBe(
    'Variante',
  );
  expect(
    (await request('open', { path: projectPath })).sections[0].outline?.nodes[0].tagIds,
  ).toEqual(['a']);
  const other = await request('create', { path: 'other-tags', name: 'Autre' });
  await expect(
    request('smartTagOperation', { projectPath, operation: { action: 'delete', id: 'a' } }),
  ).rejects.toThrow('Le projet actif a changé.');
  expect((await request('open', { path: other.path })).smartTags ?? []).toEqual([]);
});
