// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeAll, expect, it, vi } from 'vitest';
import { Binder } from '../src/project/Binder';
import type { Project, Section } from '../src/app/types';
import { applyLibraryOperation, type LibraryOperation } from '../src/project/library';
beforeAll(() => {
  HTMLDialogElement.prototype.show = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
});
const s = (id: string, i: number): Section => ({
  id,
  title: id,
  parent: null,
  kind: 'scene',
  position: i,
  text: id,
  revision: 0,
  synopsis: '',
  status: '',
  goal: 0,
});
it('selects ranges and moves, trashes and restores a batch through visible controls', async () => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  let project: Project = {
    path: 'test',
    name: 'Livre',
    sections: [s('A', 0), s('B', 1), s('C', 2)],
    settings: {},
    recovered: false,
  };
  const calls: LibraryOperation[] = [];
  function Harness() {
    const [p, setP] = useState(project);
    return (
      <Binder
        project={p}
        active="A"
        onSelect={() => {}}
        onSurface={() => {}}
        onClose={() => {}}
        onAdd={() => {}}
        onMove={() => {}}
        onContinuous={() => {}}
        onOperation={async (op) => {
          calls.push(op);
          project = applyLibraryOperation(p, op).project;
          setP(project);
        }}
      />
    );
  }
  const button = (name: string) =>
    [...host.querySelectorAll<HTMLButtonElement>('button')].find(
      (b) => b.textContent === name || b.getAttribute('aria-label') === name,
    )!;
  const click = async (name: string, modifiers: MouseEventInit = {}) => {
    await act(async () =>
      button(name).dispatchEvent(new MouseEvent('click', { bubbles: true, ...modifiers })),
    );
  };
  try {
    await act(async () => root.render(<Harness />));
    await click('A');
    await click('C', { shiftKey: true });
    expect(host.querySelector('[role="status"]')?.textContent).toContain('3 sélectionnés');
    await click('Déplacer…');
    const select = host.querySelector<HTMLSelectElement>('select[aria-label="Destination"]')!;
    await act(async () => {
      select.value = 'root:manuscript';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await click('Déplacer');
    expect(calls[0]).toMatchObject({ action: 'move', ids: ['A', 'B', 'C'], role: 'manuscript' });
    expect(button('Notes')).toBeUndefined();
    expect(host.querySelector('input[type=search]')).toBeNull();
    expect(host.querySelectorAll('.tree-row')).toHaveLength(3);
    await click('A');
    await click('B', { metaKey: true });
    await click('Mettre la sélection à la corbeille');
    expect(project.trash).toHaveLength(2);
    expect(project.sections).toHaveLength(1);
    await click('Corbeille');
    await click('A');
    await click('B', { shiftKey: true });
    await click('Restaurer');
    expect(project.trash).toHaveLength(0);
    expect(project.sections).toHaveLength(3);
    expect(button('Corbeille')).toBeDefined();
    expect(host.textContent).toContain('La corbeille est vide.');
    await click('Textes');
    expect(host.querySelectorAll('.tree-row')).toHaveLength(3);
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
it('persists collapsed branches across library openings', async () => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  const rootNode = { ...s('Dossier', 0), kind: 'folder' as const };
  const project: Project = {
    path: 'x',
    name: 'X',
    sections: [rootNode, { ...s('Enfant', 1), parent: rootNode.id }],
    settings: { collapsed: ['Dossier'] },
    recovered: false,
  };
  const configure = vi.fn();
  const host = document.createElement('div');
  const root = createRoot(host);
  try {
    await act(async () =>
      root.render(
        <Binder
          project={project}
          active={null}
          onConfigure={configure}
          onSelect={() => {}}
          onSurface={() => {}}
          onClose={() => {}}
          onAdd={() => {}}
          onMove={() => {}}
          onContinuous={() => {}}
        />,
      ),
    );
    expect(host.querySelectorAll('.tree-row')).toHaveLength(1);
    await act(async () =>
      host.querySelector<HTMLButtonElement>('[aria-label="Déplier Dossier"]')!.click(),
    );
    expect(host.querySelectorAll('.tree-row')).toHaveLength(2);
    expect(configure).toHaveBeenLastCalledWith({ collapsed: [] });
  } finally {
    await act(async () => root.unmount());
  }
});

it('distinguishes before, after, inside and root drop targets', async () => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement('div');
  const root = createRoot(host);
  const operate = vi.fn(async () => {});
  const project: Project = {
    path: 'test',
    name: 'Test',
    recovered: false,
    settings: {},
    sections: [s('A', 0), s('B', 1), { ...s('Dossier', 2), kind: 'folder' }],
  };
  const event = (type: string, clientY: number) => {
    const e = new MouseEvent(type, { bubbles: true, clientY });
    Object.defineProperty(e, 'dataTransfer', {
      value: { setData: vi.fn(), effectAllowed: 'move' },
    });
    return e;
  };
  try {
    await act(async () =>
      root.render(
        <Binder
          project={project}
          active="A"
          onSelect={() => {}}
          onSurface={() => {}}
          onClose={() => {}}
          onAdd={() => {}}
          onMove={() => {}}
          onContinuous={() => {}}
          onOperation={operate}
        />,
      ),
    );
    const rows = host.querySelectorAll<HTMLElement>('.tree-row');
    for (const row of rows) row.getBoundingClientRect = () => ({ top: 100, height: 40 }) as DOMRect;
    for (const [row, y, placement] of [
      [rows[1], 104, 'before'],
      [rows[1], 136, 'after'],
      [rows[2], 120, 'inside'],
    ] as const) {
      await act(async () => rows[0].dispatchEvent(event('dragstart', 110)));
      await act(async () => row.dispatchEvent(event('drop', y)));
      expect(operate).toHaveBeenLastCalledWith({
        action: 'move',
        ids: ['A'],
        target: row === rows[1] ? 'B' : 'Dossier',
        placement,
      });
    }
    await act(async () => rows[0].dispatchEvent(event('dragstart', 110)));
    await act(async () =>
      host.querySelector('.library-root-drop')!.dispatchEvent(event('drop', 0)),
    );
    expect(operate).toHaveBeenLastCalledWith({
      action: 'move',
      ids: ['A'],
      target: null,
      role: 'manuscript',
    });
  } finally {
    await act(async () => root.unmount());
  }
});

it('opens a collapsed drop destination after hovering, scrolls near the edge, and explains forbidden chapter nesting', async () => {
  const host = document.createElement('div'),
    root = createRoot(host);
  document.body.append(host);
  const p: Project = {
    path: 'test',
    name: 'Test',
    settings: { collapsed: ['Chapitre'] },
    recovered: false,
    sections: [
      { ...s('Chapitre', 0), kind: 'chapter' },
      { ...s('Enfant', 1), parent: 'Chapitre' },
      s('Scène libre', 2),
      { ...s('Autre chapitre', 3), kind: 'chapter' },
    ],
  };
  const dragEvent = (type: string, clientY: number) => {
    const e = new MouseEvent(type, { bubbles: true, cancelable: true, clientY });
    Object.defineProperty(e, 'dataTransfer', {
      value: { setData: vi.fn(), effectAllowed: 'move', dropEffect: 'move' },
    });
    return e;
  };
  const row = (title: string) =>
    [...host.querySelectorAll<HTMLElement>('.tree-row')].find(
      (r) => r.querySelector('.tree-title')?.textContent === title,
    )!;
  try {
    await act(async () =>
      root.render(
        <Binder
          project={p}
          active={null}
          onAdd={() => {}}
          onSelect={() => {}}
          onClose={() => {}}
          onSurface={() => {}}
          onContinuous={() => {}}
          onMove={() => {}}
        />,
      ),
    );
    const chapter = row('Chapitre'),
      nav = host.querySelector<HTMLElement>('.tree')!;
    chapter.getBoundingClientRect = () => ({ top: 100, height: 40 }) as DOMRect;
    nav.getBoundingClientRect = () => ({ top: 100, bottom: 200, height: 100 }) as DOMRect;
    Object.defineProperty(nav, 'clientHeight', { value: 100 });
    Object.defineProperty(nav, 'scrollHeight', { value: 1000 });
    await act(async () => row('Scène libre').dispatchEvent(dragEvent('dragstart', 120)));
    await act(async () => chapter.dispatchEvent(dragEvent('dragover', 120)));
    expect(chapter.classList.contains('drop-inside')).toBe(true);
    await act(async () => new Promise((resolve) => setTimeout(resolve, 600)));
    expect(row('Enfant')).toBeDefined();
    await act(async () => {
      nav.dispatchEvent(dragEvent('dragover', 195));
      await new Promise((resolve) => setTimeout(resolve, 45));
    });
    expect(nav.scrollTop).toBeGreaterThan(0);
    await act(async () => row('Scène libre').dispatchEvent(dragEvent('dragend', 120)));
    await act(async () => row('Autre chapitre').dispatchEvent(dragEvent('dragstart', 120)));
    await act(async () => chapter.dispatchEvent(dragEvent('dragover', 120)));
    expect(host.querySelector('.library-root-drop')?.textContent).toContain(
      'Un chapitre ne peut pas contenir',
    );
    expect(chapter.classList.contains('drop-inside')).toBe(false);
    await act(async () => row('Autre chapitre').dispatchEvent(dragEvent('dragend', 120)));
    expect(host.querySelector('.library-root-drop')?.textContent).toBe('');
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});

it('toggles manuscript inclusion from each eye without opening a text and shows mixed groups', async () => {
  const host = document.createElement('div'),
    root = createRoot(host),
    select = vi.fn();
  document.body.append(host);
  let current: Project = {
    path: 'eyes',
    name: 'Livre',
    settings: {},
    recovered: false,
    sections: [
      { ...s('Partie', 0), kind: 'folder' },
      { ...s('Chapitre', 1), kind: 'chapter', parent: 'Partie' },
      { ...s('A', 2), parent: 'Chapitre' },
      { ...s('B', 3), parent: 'Chapitre', included: false },
      s('Libre', 4),
    ],
  };
  function Harness() {
    const [p, setP] = useState(current);
    return (
      <Binder
        project={p}
        active="Libre"
        onSelect={select}
        onAdd={() => {}}
        onMove={() => {}}
        onSurface={() => {}}
        onClose={() => {}}
        onContinuous={() => {}}
        onOperation={async (op) => {
          current = applyLibraryOperation(p, op).project;
          setP(current);
        }}
      />
    );
  }
  const eye = (name: string) =>
    [...host.querySelectorAll<HTMLElement>('.tree-row')]
      .find((row) => row.querySelector('.tree-title')?.textContent === name)!
      .querySelector<HTMLButtonElement>('.tree-inclusion')!;
  try {
    await act(async () => root.render(<Harness />));
    expect(host.querySelectorAll('.tree-inclusion')).toHaveLength(5);
    expect(eye('Chapitre').getAttribute('aria-pressed')).toBe('mixed');
    expect(eye('Partie').getAttribute('aria-pressed')).toBe('mixed');
    await act(async () => eye('Chapitre').click());
    expect(eye('Partie').getAttribute('aria-pressed')).toBe('true');
    expect(current.sections.find((s) => s.id === 'B')?.included).toBe(true);
    await act(async () => eye('Partie').click());
    expect(eye('Chapitre').getAttribute('aria-pressed')).toBe('false');
    expect(current.sections.find((s) => s.id === 'Libre')?.included).not.toBe(false);
    expect(select).not.toHaveBeenCalled();
    expect(host.querySelector('[data-active="true"] .tree-title')?.textContent).toBe('Libre');
    expect(host.querySelectorAll('.tree-connector')).toHaveLength(3);
    expect(host.querySelectorAll('.tree-connector[data-last="true"]')).toHaveLength(2);
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
