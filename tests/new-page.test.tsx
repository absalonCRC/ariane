// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import type { Section } from '../src/contracts/project';
import { useWorkspace } from '../src/app/useWorkspace';
const request = vi.hoisted(() => vi.fn());
vi.mock('../src/platform/client', () => ({ request, native: false }));

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

it('prépare le nom dans la sidebar et crée la scène seulement après validation', async () => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  const original = section('old', 'Première page');
  const added = section('new', 'Le retour');
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
    expect(workspace.binder).toBe(true);
    expect(workspace.newSection).toMatchObject({ parent: null, kind: 'scene' });
    expect(request.mock.calls.filter(([command]) => command === 'add')).toHaveLength(0);
    await act(async () => workspace.setNewTitle('   '));
    await act(async () => workspace.add());
    expect(request.mock.calls.filter(([command]) => command === 'add')).toHaveLength(0);
    await act(async () => workspace.setNewTitle('Le retour'));
    await act(async () => workspace.add());
    expect(request).toHaveBeenCalledWith('add', {
      parent: null,
      kind: 'scene',
      title: 'Le retour',
      role: 'manuscript',
    });
    expect(workspace.selected).toEqual(added);
    expect(workspace.newSection).toBeNull();
    expect(workspace.binder).toBe(true);
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
  const added = section('new', 'Le retour');
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
    await act(async () => workspace.createPage(null));
    await act(async () => workspace.setNewTitle('Le retour'));
    let creation!: Promise<void>;
    await act(async () => {
      creation = workspace.add();
      void workspace.add();
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

it('navigates to an entity occurrence while keeping its source readable and requesting reveal in the sidebar', async () => {
  request.mockReset();
  request.mockImplementation(async (command: string) => (command === 'bootstrap' ? null : []));
  let workspace!: ReturnType<typeof useWorkspace>;
  function Harness() {
    workspace = useWorkspace();
    return null;
  }
  const root = createRoot(document.createElement('div'));
  const target = { ...section('target', 'Le quai'), text: 'La lune. Élise arrive.' };
  const source = { id: 'entity', title: 'Élise' } as import('../src/contracts/sources').Source;
  const reveal = vi.fn(() => true);
  try {
    await act(async () => root.render(<Harness />));
    await act(async () =>
      workspace.activate({
        path: 'fixture',
        name: 'Test',
        sections: [section('a', 'Début'), target],
        settings: { active: 'a' },
        recovered: false,
      }),
    );
    workspace.editor.current = {
      revealMatch: reveal,
    } as unknown as import('../src/editor/Editor').EditorHandle;
    await act(async () => workspace.setCard({ source, top: 100 }));
    const hit = {
      key: 'target:9',
      section: 'target',
      title: 'Le quai',
      from: 9,
      to: 14,
      excerpt: 'Élise arrive.',
    };
    await act(async () => {
      await workspace.locateSourceMatch(hit, 'Élise');
    });
    await act(async () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
    expect(workspace.reader).toBe(source);
    expect(workspace.card).toBeNull();
    expect(workspace.active).toBe('target');
    expect(workspace.binder).toBe(true);
    expect(workspace.revealInBinder).toBeGreaterThan(0);
    expect(reveal).toHaveBeenCalledWith('target', 9, 'Élise');
  } finally {
    await act(async () => root.unmount());
  }
});

it('reports a completed library operation and undoes it through the same durable path', async () => {
  const original = {
    path: 'fixture',
    name: 'Test',
    sections: [section('a', 'Début')],
    settings: { active: 'a' },
    recovered: false,
  };
  let stored = original as import('../src/contracts/project').Project;
  request.mockReset();
  request.mockImplementation(async (command: string, args: Record<string, unknown>) => {
    if (command === 'bootstrap') return null;
    if (command === 'libraryOperation') {
      const op = args.operation as import('../src/contracts/library').LibraryOperation;
      stored =
        op.action === 'undo'
          ? original
          : { ...original, sections: [], trash: original.sections, canUndoStructure: true };
      return stored;
    }
    return [];
  });
  let workspace!: ReturnType<typeof useWorkspace>;
  function Harness() {
    workspace = useWorkspace();
    return null;
  }
  const root = createRoot(document.createElement('div'));
  try {
    await act(async () => root.render(<Harness />));
    await act(async () => workspace.activate(original));
    await act(async () => workspace.operate({ action: 'trash', ids: ['a'] }));
    expect(workspace.libraryNotice).toEqual({
      message: '« Début » placé dans la corbeille.',
      undo: true,
    });
    await act(async () => workspace.operate({ action: 'undo' }));
    expect(workspace.doc.project?.sections).toHaveLength(1);
    expect(workspace.libraryNotice?.undo).toBe(false);
  } finally {
    await act(async () => root.unmount());
  }
});

it('keeps versions as an editor mode while settings open and returns to writing for a search result', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const original = { ...section('old', 'Le retour'), text: 'La lune éclaire le quai.' };
  request.mockReset();
  request.mockImplementation(async (command: string) => (command === 'bootstrap' ? null : []));
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
        path: 'versions-mode',
        name: 'Test',
        sections: [original],
        settings: { active: 'old' },
        recovered: false,
      }),
    );
    await act(async () => workspace.setSurface('history'));
    expect(workspace.historyMode).toBe(true);
    expect(workspace.surface).toBe('none');
    expect(workspace.binder).toBe(true);
    await act(async () => workspace.setSurface('preferences'));
    expect(workspace.historyMode).toBe(true);
    await act(async () => workspace.close());
    expect(workspace.historyMode).toBe(true);
    await act(async () =>
      workspace.locateMatch({
        section: 'old',
        title: 'Le retour',
        from: 3,
        to: 7,
        key: 'old:3',
        excerpt: original.text,
      }),
    );
    expect(workspace.historyMode).toBe(false);
    expect(workspace.selected?.id).toBe('old');
  } finally {
    await act(async () => root.unmount());
  }
});
