// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import type { Section } from '../src/app/types';
const request = vi.hoisted(() => vi.fn());
vi.mock('../src/app/client', () => ({ request, native: false }));
import { useWorkspace } from '../src/app/useWorkspace';

const section = (id: string, title: string): Section => ({
  id,
  title,
  parent: null,
  kind: 'scene',
  position: 0,
  text: '',
  revision: 0,
  synopsis: '',
  status: '',
  goal: 0,
});

it('ouvre immédiatement une page vide et prépare la saisie de son titre', async () => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  const original = section('old', 'Première page');
  const added = section('new', '');
  request.mockImplementation(async (command: string) =>
    command === 'bootstrap' ? null : command === 'add' ? [original, added] : [],
  );
  let workspace!: ReturnType<typeof useWorkspace>;
  function Harness() {
    workspace = useWorkspace();
    return null;
  }
  const root = createRoot(document.createElement('div'));
  try {
    await act(async () => root.render(<Harness />));
    await act(async () =>
      workspace.activate({
        path: 'fixture',
        name: 'Test',
        sections: [original],
        settings: { active: 'old' },
        recovered: false,
      }),
    );
    await act(async () => workspace.createPage(null));
    expect(request).toHaveBeenCalledWith('add', { parent: null, kind: 'scene', title: '' });
    expect(workspace.selected).toEqual(added);
    expect(workspace.newSection).toBeNull();
    expect(workspace.focusTitleId).toBe('new');
  } finally {
    await act(async () => root.unmount());
  }
});

it('attend la sauvegarde du titre précédent et ignore un double clic', async () => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  const original = section('old', 'Première page');
  const renamed = { ...original, title: 'Titre modifié' };
  const added = section('new', '');
  let finishUpdate!: (sections: Section[]) => void;
  request.mockReset();
  request.mockImplementation((command: string) => {
    if (command === 'bootstrap') return Promise.resolve(null);
    if (command === 'update')
      return new Promise<Section[]>((resolve) => {
        finishUpdate = resolve;
      });
    if (command === 'add') return Promise.resolve([renamed, added]);
    return Promise.resolve([]);
  });
  let workspace!: ReturnType<typeof useWorkspace>;
  function Harness() {
    workspace = useWorkspace();
    return null;
  }
  const root = createRoot(document.createElement('div'));
  try {
    await act(async () => root.render(<Harness />));
    await act(async () =>
      workspace.activate({
        path: 'fixture',
        name: 'Test',
        sections: [original],
        settings: { active: 'old' },
        recovered: false,
      }),
    );
    await act(async () => {
      void workspace.update(renamed);
    });
    let creation!: Promise<void>;
    await act(async () => {
      creation = workspace.createPage(null);
      void workspace.createPage(null);
    });
    expect(request.mock.calls.filter(([command]) => command === 'add')).toHaveLength(0);
    await act(async () => {
      finishUpdate([renamed]);
      await creation;
    });
    expect(request.mock.calls.filter(([command]) => command === 'add')).toHaveLength(1);
    expect(workspace.doc.project?.sections).toEqual([renamed, added]);
  } finally {
    await act(async () => root.unmount());
  }
});
