// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { Binder } from '../src/project/Binder';
import { ContextMenuProvider } from '../src/components/ContextMenu';
import type { Project, Section } from '../src/app/types';
const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('../src/app/client', () => ({ request }));
const section = (
  id: string,
  kind: Section['kind'],
  parent: string | null,
  position: number,
): Section => ({
  id,
  title: id,
  kind,
  parent,
  position,
  text: '',
  revision: 0,
  synopsis: '',
  status: '',
  goal: 0,
});
const project: Project = {
  path: 'current',
  name: 'Livre actuel',
  recovered: false,
  settings: {},
  sections: [
    section('Première partie', 'folder', null, 0),
    section('Le départ', 'chapter', 'Première partie', 1),
    section('Sur le quai', 'scene', 'Le départ', 2),
  ],
};
const props = {
  project,
  active: 'Sur le quai',
  onSelect: () => {},
  onSurface: () => {},
  onClose: () => {},
  onMove: () => {},
  onContinuous: () => {},
};
it('expands the project catalog before the tabs while retaining the title and current tree', async () => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  request.mockResolvedValue([
    {
      path: 'other',
      name: 'Autre livre',
      available: true,
      archived: false,
      pinned: false,
      lastOpened: '2026-11-01',
    },
  ]);
  const host = document.createElement('div'),
    root = createRoot(host),
    open = vi.fn();
  document.body.append(host);
  try {
    await act(async () => root.render(<Binder {...props} onAdd={() => {}} onOpenProject={open} />));
    const disclosure = host.querySelector<HTMLButtonElement>('.library-project-title')!;
    await act(async () => disclosure.click());
    const catalog = host.querySelector('#sidebar-projects')!;
    const tabs = host.querySelector('[aria-label="Contenu du projet"]')!;
    expect(disclosure.getAttribute('aria-expanded')).toBe('true');
    expect(disclosure.textContent).toBe('Livre actuel');
    expect(catalog.compareDocumentPosition(tabs) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(host.querySelectorAll('.tree-row')).toHaveLength(3);
    expect(catalog.querySelector('input')).toBeNull();
    await act(async () =>
      (host.querySelector('[aria-label="Contenu du projet"] button') as HTMLButtonElement).click(),
    );
    expect(host.querySelector('#sidebar-projects')).not.toBeNull();
    await act(async () => host.querySelector<HTMLButtonElement>('.catalog-open')!.click());
    expect(open).toHaveBeenCalledWith('other');
    expect(host.querySelector('#sidebar-projects')).toBeNull();
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
it('creates sections at the root, chapters within sections and scenes within chapters', async () => {
  const host = document.createElement('div'),
    root = createRoot(host),
    add = vi.fn();
  document.body.append(host);
  const menuClick = async (label: string) => {
    const button = [...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find(
      (b) => b.textContent === label,
    )!;
    await act(async () => button.click());
  };
  try {
    await act(async () =>
      root.render(
        <ContextMenuProvider>
          <Binder {...props} onAdd={add} />
        </ContextMenuProvider>,
      ),
    );
    expect(
      [...host.querySelectorAll('.tree-row')].map((row) => row.getAttribute('data-kind')),
    ).toEqual(['folder', 'chapter', 'scene']);
    await act(async () => host.querySelector<HTMLButtonElement>('.library-create')!.click());
    await menuClick('Nouvelle section');
    expect(add).toHaveBeenLastCalledWith(null, 'folder', 'manuscript');
    await act(async () =>
      host.querySelector<HTMLButtonElement>('[aria-label="Ajouter dans Première partie"]')!.click(),
    );
    await menuClick('Nouveau chapitre');
    expect(add).toHaveBeenLastCalledWith('Première partie', 'chapter', 'manuscript');
    await act(async () =>
      host.querySelector<HTMLButtonElement>('[aria-label="Ajouter dans Le départ"]')!.click(),
    );
    expect(
      [...document.querySelectorAll('[role=menuitem]')].some(
        (button) => button.textContent === 'Nouveau chapitre',
      ),
    ).toBe(false);
    await menuClick('Nouvelle scène');
    expect(add).toHaveBeenLastCalledWith('Le départ', 'scene', 'manuscript');
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});

it('keeps the creation field inside its parent, validates it inline and cancels with Escape', async () => {
  const host = document.createElement('div'),
    root = createRoot(host);
  document.body.append(host);
  const confirm = vi.fn(async () => {}),
    cancel = vi.fn(),
    change = vi.fn();
  try {
    await act(async () =>
      root.render(
        <Binder
          {...props}
          onAdd={() => {}}
          project={{
            ...project,
            settings: { collapsed: ['Première partie', 'Le départ'], libraryView: 'sources' },
          }}
          creation={{ parent: 'Le départ', kind: 'scene' }}
          creationTitle="La rencontre"
          onCreationTitle={change}
          onConfirmCreation={confirm}
          onCancelCreation={cancel}
        />,
      ),
    );
    const input = host.querySelector<HTMLInputElement>('input[aria-label="Nom de la scène"]')!;
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    expect(input.closest('.tree')).not.toBeNull();
    expect(document.activeElement).toBe(input);
    expect(host.querySelectorAll('.tree-row')).toHaveLength(4);
    expect(input.closest('form')!.style.paddingLeft).toBe('56px');
    await act(async () =>
      input
        .closest('form')!
        .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
    );
    expect(confirm).toHaveBeenCalledOnce();
    await act(async () =>
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })),
    );
    expect(cancel).toHaveBeenCalledOnce();
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});

it('places the collapse chevron at the pointer height within the sidebar edge', async () => {
  const host = document.createElement('div'),
    root = createRoot(host),
    close = vi.fn();
  try {
    await act(async () => root.render(<Binder {...props} onAdd={() => {}} onClose={close} />));
    const edge = host.querySelector<HTMLButtonElement>('.binder-edge-trigger')!;
    edge.getBoundingClientRect = () => ({ top: 36, height: 500 }) as DOMRect;
    await act(async () =>
      edge.dispatchEvent(new MouseEvent('pointermove', { clientY: 150, bubbles: true })),
    );
    expect(edge.style.getPropertyValue('--sidebar-chevron-y')).toBe('114px');
    await act(async () =>
      edge.dispatchEvent(new MouseEvent('pointermove', { clientY: 390, bubbles: true })),
    );
    expect(edge.style.getPropertyValue('--sidebar-chevron-y')).toBe('354px');
    await act(async () => edge.click());
    expect(close).toHaveBeenCalledOnce();
  } finally {
    await act(async () => root.unmount());
  }
});

it('reveals a requested scene, keeps its collapsed parent marked, and separates the open text from batch selection', async () => {
  const host = document.createElement('div'),
    root = createRoot(host),
    revealed = vi.fn();
  document.body.append(host);
  const p = { ...project, settings: { collapsed: ['Première partie', 'Le départ'] } };
  const render = (reveal = 0) =>
    root.render(
      <Binder {...props} project={p} onAdd={() => {}} reveal={reveal} onRevealed={revealed} />,
    );
  try {
    await act(async () => render());
    expect(host.querySelector('[data-active-within="true"] .tree-title')?.textContent).toBe(
      'Première partie',
    );
    await act(async () => render(1));
    expect(host.querySelectorAll('.tree-row')).toHaveLength(3);
    expect(revealed).toHaveBeenCalledOnce();
    expect(host.querySelector('[data-active="true"] .tree-title')?.textContent).toBe('Sur le quai');
    await act(async () =>
      host.querySelector<HTMLButtonElement>('[aria-label="Replier Le départ"]')!.click(),
    );
    expect(host.querySelector('[data-active-within="true"] .tree-title')?.textContent).toBe(
      'Le départ',
    );
    expect(host.querySelectorAll('.tree-row')).toHaveLength(2);
    await act(async () =>
      host
        .querySelector<HTMLButtonElement>('.tree-title')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true, metaKey: true })),
    );
    expect(host.querySelector('[data-selected="true"]')?.getAttribute('data-active')).toBe('false');
    expect(host.querySelector('[data-active-within="true"]')).not.toBeNull();
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});

it('navigates parents and children with arrows and renames with F2 without opening a dialog', async () => {
  const host = document.createElement('div'),
    root = createRoot(host),
    rename = vi.fn(async () => {});
  document.body.append(host);
  const key = async (key: string) => {
    await act(async () => {
      document.activeElement!.dispatchEvent(
        new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }),
      );
      await new Promise((resolve) => requestAnimationFrame(resolve));
    });
  };
  try {
    await act(async () => root.render(<Binder {...props} onAdd={() => {}} onRename={rename} />));
    host.querySelector<HTMLButtonElement>('.tree-title')!.focus();
    await key('ArrowLeft');
    expect(host.querySelectorAll('.tree-row')).toHaveLength(1);
    await key('ArrowRight');
    expect(host.querySelectorAll('.tree-row')).toHaveLength(3);
    await key('ArrowRight');
    expect(document.activeElement?.textContent).toBe('Le départ');
    await key('ArrowLeft'); // collapse chapter
    await key('ArrowLeft'); // parent
    expect(document.activeElement?.textContent).toBe('Première partie');
    await key('F2');
    const input = host.querySelector<HTMLInputElement>('[aria-label="Nouveau titre"]')!;
    expect(document.activeElement).toBe(input);
    await key('Enter');
    expect(rename).toHaveBeenCalledWith('Première partie', 'Première partie');
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});

it('offers a sibling scene and renders its inline name before the next sibling', async () => {
  const host = document.createElement('div'),
    root = createRoot(host),
    add = vi.fn();
  document.body.append(host);
  const p = {
    ...project,
    sections: [...project.sections, section('Suite', 'scene', 'Le départ', 3)],
  };
  try {
    await act(async () =>
      root.render(
        <ContextMenuProvider>
          <Binder {...props} project={p} onAdd={add} />
        </ContextMenuProvider>,
      ),
    );
    await act(async () =>
      host
        .querySelector('[data-kind="scene"]')!
        .dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })),
    );
    await act(async () =>
      [...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')]
        .find((b) => b.textContent?.includes('Nouvelle scène après celle-ci'))!
        .click(),
    );
    expect(add).toHaveBeenCalledWith('Le départ', 'scene', 'manuscript', 'Sur le quai');
    await act(async () =>
      root.render(
        <Binder
          {...props}
          project={p}
          onAdd={add}
          creation={{ parent: 'Le départ', kind: 'scene', after: 'Sur le quai' }}
        />,
      ),
    );
    const rows = [...host.querySelectorAll<HTMLElement>('.tree-row')];
    expect(rows[3].classList.contains('tree-create')).toBe(true);
    expect(rows[4].textContent).toContain('Suite');
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
