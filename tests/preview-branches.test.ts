// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import type { HistoryState, MergePreview, Project, Version } from '../src/app/types';
vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => false, invoke: vi.fn() }));
import { request } from '../src/app/client';
import { mergeParagraphs, mergeSections, validateMergedSections } from '../src/history/merge';
import { historySessions } from '../src/history/VersionTimeline';

afterEach(() => {
  localStorage.clear();
  vi.useRealTimers();
});
async function setup() {
  const p = await request<Project>('create', { path: 'branch-test', name: 'Roman' });
  const id = p.sections[0].id,
    projectPath = p.path;
  const write = async (text: string) => {
    const current = await request<Project>('open', { path: projectPath });
    await request('save', {
      patches: [{ id, revision: current.sections.find((s) => s.id === id)!.revision, text }],
    });
  };
  const state = () => request<HistoryState>('historyState', { projectPath });
  const branch = async () => {
    await request('createBranch', { projectPath, name: 'Autre fin' });
    return (await state()).activeBranch;
  };
  return { p, id, projectPath, write, state, branch };
}
it('keeps both live drafts, isolates automatic histories and reopens the active variant', async () => {
  const h = await setup();
  await h.write('Principal.');
  const variant = await h.branch();
  await h.write('Variante.');
  expect((await request<Version[]>('versions')).every((v) => v.branchId === variant)).toBe(true);
  const main = await request<Project>('switchBranch', { projectPath: h.projectPath, id: 'main' });
  expect(main.sections[0].text).toBe('Principal.');
  await h.write('Principal poursuivi.');
  await request('switchBranch', { projectPath: h.projectPath, id: variant });
  expect((await request<Project>('bootstrap')).sections[0].text).toBe('Variante.');
  expect(
    (await request<Project>('switchBranch', { projectPath: h.projectPath, id: 'main' })).sections[0]
      .text,
  ).toBe('Principal poursuivi.');
});
it('promotes an automatic state in place and groups captures without treating names as metadata', async () => {
  const h = await setup();
  await h.write('État.');
  const [automatic] = await request<Version[]>('versions');
  const promoted = await request<Version>('promoteVersion', {
    projectPath: h.projectPath,
    id: automatic.id,
    name: 'Premier jet',
  });
  expect(promoted).toMatchObject({
    id: automatic.id,
    created: automatic.created,
    name: 'Premier jet',
    automatic: false,
  });
  const named = await request<Version>('capture', { name: 'Sauvegarde automatique', scope: null });
  await h.write('Suite.');
  const auto2 = await request<Version>('automaticVersion', {
    projectPath: h.projectPath,
    scope: h.id,
  });
  await h.write('Encore.');
  const auto3 = await request<Version>('automaticVersion', {
    projectPath: h.projectPath,
    scope: h.id,
  });
  expect(auto3.sessionId).toBe(auto2.sessionId);
  const groups = historySessions(await request<Version[]>('versions'));
  expect(groups.find((g) => g.some((v) => v.id === named.id))).toHaveLength(1);
  const session = groups.find((g) => g.some((v) => v.id === auto3.id))!;
  expect(session.some((v) => v.id === auto2.id)).toBe(true);
  expect(session.every((v) => v.automatic)).toBe(true);
});
it('merges independent edits and restores the preintegration snapshot', async () => {
  const h = await setup();
  await h.write('A\n\nB\n\nC');
  const variant = await h.branch();
  await h.write('A\n\nB\n\nZ');
  await request('switchBranch', { projectPath: h.projectPath, id: 'main' });
  await h.write('X\n\nB\n\nC');
  const preview = await request<MergePreview>('mergePreview', {
    projectPath: h.projectPath,
    source: variant,
  });
  expect(preview.entries[0]).toMatchObject({ conflict: false, result: { text: 'X\n\nB\n\nZ' } });
  const merged = await request<Project>('mergeBranch', {
    projectPath: h.projectPath,
    source: variant,
    token: preview.token,
    resolutions: [],
  });
  expect(merged.sections[0].text).toBe('X\n\nB\n\nZ');
  const recovery = (await request<Version[]>('versions')).find(
    (v) => v.name === 'Avant intégration',
  )!;
  expect(
    (
      await request<MergePreview>('mergePreview', { projectPath: h.projectPath, source: variant })
    ).entries.some((e) => e.changed),
  ).toBe(false);
  expect((await request<Project>('restore', { id: recovery.id })).sections[0].text).toBe(
    'X\n\nB\n\nC',
  );
});
it('requires resolutions and rejects stale reviews before any mutation', async () => {
  const h = await setup();
  await h.write('Origine.');
  const variant = await h.branch();
  await h.write('Variante.');
  await request('switchBranch', { projectPath: h.projectPath, id: 'main' });
  await h.write('Principal.');
  const preview = await request<MergePreview>('mergePreview', {
    projectPath: h.projectPath,
    source: variant,
  });
  expect(preview.entries[0].conflict).toBe(true);
  const before = localStorage.getItem('ariane.preview.projects.v1');
  await expect(
    request('mergeBranch', {
      projectPath: h.projectPath,
      source: variant,
      token: preview.token,
      resolutions: [],
    }),
  ).rejects.toThrow('résolution');
  expect(localStorage.getItem('ariane.preview.projects.v1')).toBe(before);
  await h.write('Principal récent.');
  await expect(
    request('mergeBranch', {
      projectPath: h.projectPath,
      source: variant,
      token: preview.token,
      resolutions: [{ id: h.id, choice: 'incoming' }],
    }),
  ).rejects.toThrow('changé');
  const fresh = await request<MergePreview>('mergePreview', {
    projectPath: h.projectPath,
    source: variant,
  });
  expect(
    (
      await request<Project>('mergeBranch', {
        projectPath: h.projectPath,
        source: variant,
        token: fresh.token,
        resolutions: [{ id: h.id, choice: 'custom', text: 'Texte retenu.' }],
      })
    ).sections[0].text,
  ).toBe('Texte retenu.');
});
it.each(['current', 'incoming'] as const)(
  'preserves independent section changes when resolving a text conflict with %s',
  async (choice) => {
    const h = await setup();
    await h.write('Origine.');
    const variant = await h.branch();
    await h.write('Variante.');
    let section = (await request<Project>('open', { path: h.projectPath })).sections[0];
    await request('update', { section: { ...section, synopsis: 'Résumé de la variante' } });
    await request('switchBranch', { projectPath: h.projectPath, id: 'main' });
    await h.write('Principal.');
    section = (await request<Project>('open', { path: h.projectPath })).sections[0];
    await request('update', { section: { ...section, title: 'Titre principal' } });
    const preview = await request<MergePreview>('mergePreview', {
      projectPath: h.projectPath,
      source: variant,
    });
    expect(preview.entries[0].fields).toEqual(['text']);
    expect(preview.entries[0].title).toBe('Titre principal');
    const merged = await request<Project>('mergeBranch', {
      projectPath: h.projectPath,
      source: variant,
      token: preview.token,
      resolutions: [{ id: h.id, choice }],
    });
    expect(merged.sections[0]).toMatchObject({
      title: 'Titre principal',
      synopsis: 'Résumé de la variante',
      text: choice === 'current' ? 'Principal.' : 'Variante.',
    });
  },
);
it('does not mutate either draft when a chosen text is incompatible with the preserved outline', async () => {
  const h = await setup();
  await h.write('Origine.');
  const variant = await h.branch();
  await h.write('Court.');
  await request('switchBranch', { projectPath: h.projectPath, id: 'main' });
  const current = await request<Project>('open', { path: h.projectPath });
  await request('save', {
    patches: [
      {
        id: h.id,
        revision: current.sections[0].revision,
        text: 'Long\nSuite.',
        outline: {
          version: 1,
          nodes: [
            { id: 'a', parent: null, start: 0 },
            { id: 'b', parent: null, start: 5 },
          ],
        },
      },
    ],
  });
  const preview = await request<MergePreview>('mergePreview', {
    projectPath: h.projectPath,
    source: variant,
  });
  expect(preview.entries[0].fields).toEqual(['text']);
  await expect(
    request('mergeBranch', {
      projectPath: h.projectPath,
      source: variant,
      token: preview.token,
      resolutions: [{ id: h.id, choice: 'incoming' }],
    }),
  ).rejects.toThrow('plan ne correspond pas');
  expect((await request<Project>('bootstrap')).sections[0].text).toBe('Long\nSuite.');
  expect(
    (await request<Project>('switchBranch', { projectPath: h.projectPath, id: variant }))
      .sections[0].text,
  ).toBe('Court.');
});
it('keeps excluded changes available and preserves named branch origins', async () => {
  const h = await setup();
  await h.write('Origine.');
  const variant = await h.branch();
  await h.write('Variante.');
  const preview = await request<MergePreview>('mergePreview', {
    projectPath: h.projectPath,
    source: variant,
  });
  const merged = await request<Project>('mergeBranch', {
    projectPath: h.projectPath,
    source: variant,
    token: preview.token,
    resolutions: [{ id: h.id, choice: 'current' }],
  });
  expect(merged.sections[0].text).toBe('Origine.');
  expect(
    (
      await request<MergePreview>('mergePreview', { projectPath: h.projectPath, source: variant })
    ).entries.some((e) => e.changed),
  ).toBe(true);
  await expect(request('switchBranch', { projectPath: 'wrong', id: variant })).rejects.toThrow(
    'changé',
  );
});
it('treats edit/delete and incompatible parent moves as explicit conflicts', () => {
  const s = {
    id: 'a',
    parent: null,
    title: 'Texte',
    kind: 'scene' as const,
    position: 0,
    text: 'A',
    revision: 0,
    synopsis: '',
    status: 'Brouillon',
    goal: 0,
  };
  expect(mergeSections([s], [{ ...s, text: 'B' }], [])[0].conflict).toBe(true);
  expect(mergeSections([s], [{ ...s, text: 'B' }], [{ ...s, trashed: true }])[0].conflict).toBe(
    true,
  );
  expect(() => validateMergedSections([{ ...s, parent: 'a' }])).toThrow('arborescence');
  expect(mergeParagraphs('A\n\nB', 'X\n\nB', 'Y\n\nB')).toBeNull();
});

it('integrates inherited edits when a variant is created from another variant', async () => {
  const h = await setup();
  await h.write('A\n\nB\n\nC');
  await h.branch();
  await h.write('X\n\nB\n\nC');
  await request('createBranch', { projectPath: h.projectPath, name: 'Petite-fille' });
  const child = (await h.state()).activeBranch;
  await h.write('X\n\nB\n\nZ');
  const preview = await request<MergePreview>('mergePreview', {
    projectPath: h.projectPath,
    source: child,
  });
  const merged = await request<Project>('mergeBranch', {
    projectPath: h.projectPath,
    source: child,
    token: preview.token,
    resolutions: [],
  });
  expect(merged.sections[0].text).toBe('X\n\nB\n\nZ');
});

it('rolls back a preview switch if local storage fills after the branch update', async () => {
  const h = await setup();
  await h.write('Principal.');
  const variant = await h.branch();
  await h.write('Brouillon précieux.');
  const before = localStorage.getItem('ariane.preview.projects.v1');
  const original = Storage.prototype.setItem;
  let failed = false;
  const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
    this: Storage,
    key,
    value,
  ) {
    if (!failed && key === 'ariane.preview.projects.v1') {
      failed = true;
      throw new DOMException('Full', 'QuotaExceededError');
    }
    original.call(this, key, value);
  });
  try {
    await expect(
      request('switchBranch', { projectPath: h.projectPath, id: 'main' }),
    ).rejects.toThrow('Full');
  } finally {
    spy.mockRestore();
  }
  expect((await h.state()).activeBranch).toBe(variant);
  expect(localStorage.getItem('ariane.preview.projects.v1')).toBe(before);
});

it('restores a variant origin while preserving the outgoing draft', async () => {
  const h = await setup();
  await h.write('Origine.');
  const branchId = await h.branch();
  const origin = (await h.state()).branches.find((branch) => branch.id === branchId)!.baseVersion!;
  await h.write('Autre fin.');
  const restored = await request<Project>('restore', { id: origin });
  expect(restored.sections[0].text).toBe('Origine.');
  expect((await h.state()).activeBranch).toBe(branchId);
  const backup = (await request<Version[]>('versions')).find(
    (v) => v.name === 'Avant restauration',
  )!;
  expect((await request<Version>('version', { id: backup.id })).sections[0].text).toBe(
    'Autre fin.',
  );
});

it('rejects restoration of a version from an unrelated variant', async () => {
  const h = await setup();
  await h.write('Origine.');
  await h.branch();
  await h.write('Piste A.');
  const version = await request<Version>('capture', { name: 'Piste A', scope: null });
  await request('switchBranch', { projectPath: h.projectPath, id: 'main' });
  await request('createBranch', { projectPath: h.projectPath, name: 'Piste B' });
  await expect(request('restore', { id: version.id })).rejects.toThrow('autre variante');
  expect((await request<Project>('bootstrap')).sections[0].text).toBe('Origine.');
});
