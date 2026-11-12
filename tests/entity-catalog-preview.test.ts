// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => false, invoke: vi.fn() }));
import { request } from '../src/platform/client';
import type { EntityIdentity } from '../src/contracts/entityIdentity';
afterEach(() => localStorage.clear());
it('persists homonyms, previews merges, undoes after reopening and protects subsequent changes', async () => {
  const p = await request('create', { path: 'identities', name: 'Identités' }),
    projectPath = p.path;
  const a: EntityIdentity = {
    id: 'a',
    title: 'Claude',
    kind: 'Personne',
    aliases: [],
    sourceIds: [],
    detectedIds: [],
    confirmed: true,
  };
  await request('entityOperation', {
    projectPath,
    revision: 0,
    operation: { action: 'save', entity: a },
  });
  await request('entityOperation', {
    projectPath,
    revision: 1,
    operation: { action: 'save', entity: { ...a, id: 'b' } },
  });
  const preview = await request('entityMergePreview', { projectPath, source: 'a', target: 'b' });
  await request('entityOperation', {
    projectPath,
    revision: 2,
    operation: { action: 'merge', source: 'a', target: 'b', token: preview.token },
  });
  await request('open', { path: projectPath });
  const history = await request('entityMergeHistory', { projectPath });
  await request('entityOperation', {
    projectPath,
    revision: 3,
    operation: { action: 'undoMerge', id: history[0].id },
  });
  expect((await request('entityCatalog', { projectPath })).entities.every((e) => !e.redirect)).toBe(
    true,
  );
  const next = await request('entityMergePreview', { projectPath, source: 'a', target: 'b' });
  await request('entityOperation', {
    projectPath,
    revision: 4,
    operation: { action: 'merge', source: 'a', target: 'b', token: next.token },
  });
  await request('entityOperation', {
    projectPath,
    revision: 5,
    operation: { action: 'save', entity: { ...a, id: 'b', title: 'Récent' } },
  });
  const records = await request('entityMergeHistory', { projectPath });
  await expect(
    request('entityOperation', {
      projectPath,
      revision: 6,
      operation: { action: 'undoMerge', id: records[0].id },
    }),
  ).rejects.toThrow(/conservées/);
});
it('isolates identity drafts between variants and preserves saved views across restores', async () => {
  const p = await request('create', { path: 'variants-identities', name: 'Variantes' }),
    projectPath = p.path;
  const a: EntityIdentity = {
    id: 'a',
    title: 'Origine',
    kind: 'Lieu',
    aliases: [],
    sourceIds: [],
    detectedIds: [],
    confirmed: true,
  };
  await request('entityOperation', {
    projectPath,
    revision: 0,
    operation: { action: 'save', entity: a },
  });
  const version = await request('capture', { name: 'Origine' });
  await request('createBranch', { projectPath, name: 'Variante' });
  const branch = (await request('historyState', { projectPath })).activeBranch;
  let catalog = await request('entityCatalog', { projectPath });
  await request('entityOperation', {
    projectPath,
    revision: catalog.revision,
    operation: { action: 'save', entity: { ...a, title: 'Variante' } },
  });
  await request('switchBranch', { projectPath, id: 'main' });
  expect((await request('entityCatalog', { projectPath })).entities[0].title).toBe('Origine');
  await request('switchBranch', { projectPath, id: branch });
  expect((await request('entityCatalog', { projectPath })).entities[0].title).toBe('Variante');
  await request('switchBranch', { projectPath, id: 'main' });
  const views = await request('savedViews', { projectPath });
  await request('saveView', {
    projectPath,
    token: views.token,
    view: {
      id: 'v',
      name: 'Ma vue',
      query: { version: 1, groups: [[{ kind: 'entity', id: 'a' }]] },
    },
  });
  catalog = await request('entityCatalog', { projectPath });
  await request('entityOperation', {
    projectPath,
    revision: catalog.revision,
    operation: { action: 'save', entity: { ...a, title: 'Nouveau' } },
  });
  await request('restore', { id: version.id });
  expect((await request('entityCatalog', { projectPath })).entities[0].title).toBe('Origine');
  expect((await request('savedViews', { projectPath })).items[0].name).toBe('Ma vue');
  await request('create', { path: 'other-identities', name: 'Autre' });
  await expect(request('entityCatalog', { projectPath })).rejects.toThrow(/changé/);
});
