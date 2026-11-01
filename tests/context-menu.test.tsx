// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { history } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import {
  ContextMenuProvider,
  useContextMenu,
  type MenuContent,
} from '../src/components/ContextMenu';
import { editorContext } from '../src/editor/contextMenu';
import { outlineEditor } from '../src/editor/outline/state';
import { compose, sectionMapping } from '../src/editor/composite';
import { Binder } from '../src/project/Binder';
import type { Section } from '../src/app/types';

const section = (id: string, text = 'Alpha\nBeta\nGamma'): Section => ({
  id,
  parent: null,
  position: 0,
  kind: 'scene',
  title: id,
  text,
  revision: 0,
  synopsis: '',
  status: '',
  goal: 0,
  outline: {
    version: 1,
    nodes: text
      .split('\n')
      .map((_, i, lines) => ({
        id: `${id}-${i}`,
        parent: null,
        start: lines.slice(0, i).reduce((n, line) => n + line.length + 1, 0),
      })),
  },
});
let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
const views: EditorView[] = [];
const clipboard = {
  writeText: vi.fn(async (_text: string) => {}),
  readText: vi.fn(async () => 'collé'),
};
let previousClipboard: PropertyDescriptor | undefined;
beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  previousClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: clipboard });
  vi.clearAllMocks();
});
afterEach(async () => {
  for (const view of views.splice(0)) view.destroy();
  await act(async () => root.unmount());
  host.remove();
  if (previousClipboard) Object.defineProperty(navigator, 'clipboard', previousClipboard);
  else Reflect.deleteProperty(navigator, 'clipboard');
});
function editor(sections = [section('scene')], from = 0, to = from, readOnly = false) {
  const data = compose(sections),
    mapping = sectionMapping(data.spans);
  const outline = outlineEditor(sections, data.spans, mapping.field);
  const view = new EditorView({
    parent: host,
    state: EditorState.create({
      doc: data.text,
      selection: { anchor: from, head: to },
      extensions: [
        history(),
        mapping.extensions,
        outline.extensions,
        markdown(),
        EditorState.readOnly.of(readOnly),
      ],
    }),
  });
  views.push(view);
  return {
    view,
    menu: (onSearch?: (value: string) => void) =>
      editorContext(view, outline, view.state.field(mapping.field), () => view, onSearch),
  };
}
const labels = (menu: MenuContent) => menu.groups.flat().map((action) => action.label);
const action = (menu: MenuContent, label: string) =>
  menu.groups.flat().find((action) => action.label === label)!;

describe('actions adaptées au texte', () => {
  it('preserves the selected range when cutting and supports undo', async () => {
    const { view, menu } = editor(undefined, 0, 5);
    const search = vi.fn(),
      content = menu(search);
    expect(labels(content)).toContain('Gras');
    expect(labels(content)).not.toContain('Indenter le passage');
    expect(content.detail).toBe('1 mot sélectionné');
    await action(content, 'Rechercher dans les sources').run();
    expect(search).toHaveBeenCalledWith('Alpha');
    await action(content, 'Couper').run();
    expect(clipboard.writeText).toHaveBeenCalledWith('Alpha');
    expect(view.state.doc.toString()).toBe('\nBeta\nGamma');
    expect(labels(menu())).toContain('Annuler');
    action(menu(), 'Annuler').run();
    expect(view.state.doc.toString()).toBe('Alpha\nBeta\nGamma');
    expect(labels(menu())).toContain('Rétablir');
  });
  it('shows only structural actions that can apply to the clicked passage', () => {
    const first = editor();
    expect(labels(first.menu())).not.toContain('Indenter le passage');
    expect(labels(first.menu())).not.toContain('Monter le passage');
    expect(labels(first.menu())).not.toContain('Replier les sous-passages');
    expect(labels(first.menu())).toContain('Descendre le passage');
    const last = editor(undefined, 11);
    expect(labels(last.menu())).toContain('Indenter le passage');
    expect(labels(last.menu())).not.toContain('Descendre le passage');
    action(last.menu(), 'Indenter le passage').run();
    expect(labels(last.menu())).toContain('Désindenter le passage');
  });
  it('does not replace newer text when clipboard access finishes late', async () => {
    const { view, menu } = editor(undefined, 0, 5);
    let resolve!: (value: string) => void;
    clipboard.readText.mockImplementationOnce(
      () =>
        new Promise<string>((done) => {
          resolve = done;
        }),
    );
    const pasted = action(menu(), 'Coller').run();
    view.dispatch({ changes: { from: 0, insert: 'Nouveau ' } });
    resolve('ancien');
    await pasted;
    expect(view.state.doc.toString()).toBe('Nouveau Alpha\nBeta\nGamma');
  });
  it('omits formatting across scenes and editing in read-only text', () => {
    const crossing = editor([section('a', 'Alpha'), section('b', 'Beta')], 0, 10);
    expect(labels(crossing.menu())).not.toContain('Gras');
    const readonly = editor(undefined, 0, 5, true);
    expect(labels(readonly.menu())).toEqual(['Copier']);
  });
});
function Harness({ run }: { run: () => void }) {
  const open = useContextMenu();
  return (
    <button
      onContextMenu={(event) =>
        open(event, {
          title: 'Passage',
          groups: [
            [],
            [
              { label: 'Première', run },
              { label: 'Dernière', run },
            ],
          ],
        })
      }
    >
      Cible
    </button>
  );
}
describe('comportement du menu', () => {
  it('supports keyboard navigation and escape without closing the underlying workspace', async () => {
    const run = vi.fn(),
      escape = vi.fn();
    window.addEventListener('keydown', escape);
    try {
      await act(async () =>
        root.render(
          <ContextMenuProvider>
            <Harness run={run} />
          </ContextMenuProvider>,
        ),
      );
      const trigger = host.querySelector('button')!;
      trigger.focus();
      await act(async () =>
        trigger.dispatchEvent(
          new MouseEvent('contextmenu', {
            bubbles: true,
            cancelable: true,
            clientX: 2000,
            clientY: 2000,
          }),
        ),
      );
      const menu = document.querySelector<HTMLElement>('[role="menu"]')!;
      expect(menu).not.toBeNull();
      expect(document.activeElement?.textContent).toContain('Première');
      expect(parseInt(menu.style.left)).toBeLessThanOrEqual(innerWidth - 8);
      await act(async () =>
        document.activeElement!.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'End', bubbles: true }),
        ),
      );
      expect(document.activeElement?.textContent).toContain('Dernière');
      await act(async () =>
        document.activeElement!.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
        ),
      );
      const closing = document.querySelector('[role="menu"]')!;
      expect(closing.getAttribute('aria-hidden')).toBe('true');
      expect(closing.hasAttribute('inert')).toBe(true);
      await act(async () => closing.querySelector<HTMLButtonElement>('button')!.click());
      expect(run).not.toHaveBeenCalled();
      expect(document.activeElement).toBe(trigger);
      expect(escape).not.toHaveBeenCalledWith(expect.objectContaining({ key: 'Escape' }));
    } finally {
      window.removeEventListener('keydown', escape);
    }
  });
  it('targets an inactive binder row and keeps adding actions out of a scene menu', async () => {
    const rename = vi.fn(async () => {}),
      select = vi.fn(),
      add = vi.fn();
    await act(async () =>
      root.render(
        <ContextMenuProvider>
          <Binder
            project={{
              path: 'test',
              name: 'Test',
              settings: {},
              recovered: false,
              sections: [section('Active'), { ...section('Inactive'), position: 1 }],
            }}
            active="Active"
            onRename={rename}
            onSelect={select}
            onAdd={add}
            onSurface={() => {}}
            onClose={() => {}}
            onMove={() => {}}
            onContinuous={() => {}}
          />
        </ContextMenuProvider>,
      ),
    );
    const row = [...host.querySelectorAll('.tree-row')].find(
      (row) => row.textContent === 'Inactive',
    )!;
    await act(async () =>
      row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })),
    );
    expect(select).not.toHaveBeenCalled();
    const menu = document.querySelector('[role="menu"]')!;
    expect(menu.textContent).not.toContain('Ajouter une scène ici');
    await act(async () =>
      [...menu.querySelectorAll('button')]
        .find((button) => button.textContent === 'Renommer')!
        .click(),
    );
    const input = host.querySelector<HTMLInputElement>('.tree-rename')!;
    expect(input.value).toBe('Inactive');
    await act(async () =>
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })),
    );
    expect(rename).toHaveBeenCalledWith('Inactive', 'Inactive');
    expect(select).not.toHaveBeenCalled();
  });
});

describe('menus de source', () => {
  it('offers citation only for a supplied passage and reads the clicked source', async () => {
    const { sourceContext } = await import('../src/sources/contextMenu');
    const source = { title: 'Carnet', kind: 'Document', text: '# Carnet\n\nLe passage.' } as import('../src/app/types').Source;
    const read = vi.fn(), cite = vi.fn();
    const content = sourceContext(source, { onRead: read, onCite: cite });
    action(content, 'Ouvrir la note').run(); expect(read).toHaveBeenCalledOnce();
    action(content, 'Citer l’extrait').run(); expect(cite).toHaveBeenCalledWith('Le passage.');
    const reader = sourceContext(source, { quote: '' });
    expect(labels(reader)).toEqual(['Copier le titre']);
  });
});

describe('barre de sélection', () => {
  it('appears only for a selection, keeps focus on pointer down, and yields to the context menu', async () => {
    const { SelectionToolbar } = await import('../src/components/SelectionToolbar');
    const format = vi.fn(), run = vi.fn();
    await act(async () => root.render(<ContextMenuProvider><Harness run={run} /><SelectionToolbar anchor={null} onFormat={format} /></ContextMenuProvider>));
    expect(document.querySelector('[role="toolbar"]')).toBeNull();
    await act(async () => root.render(<ContextMenuProvider><Harness run={run} /><SelectionToolbar anchor={{ left: 400, top: 300, bottom: 330 }} onFormat={format} /></ContextMenuProvider>));
    const toolbar = document.querySelector('[role="toolbar"]')!;
    const bold = toolbar.querySelector<HTMLButtonElement>('[aria-label="Gras"]')!;
    const down = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    await act(async () => bold.dispatchEvent(down));
    expect(down.defaultPrevented).toBe(true);
    await act(async () => bold.click()); expect(format).toHaveBeenCalledWith('bold');
    await act(async () => host.querySelector('button')!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })));
    expect(document.querySelector('[role="toolbar"]')).toBeNull();
    expect(document.querySelector('[role="menu"]')).not.toBeNull();
  });
});
