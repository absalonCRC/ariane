// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { EditorView } from '@codemirror/view';
import { undo } from '@codemirror/commands';
import { expect, it, vi } from 'vitest';
import { App } from '../src/app/App';
import { ContextMenuProvider } from '../src/components/ContextMenu';
import { request } from '../src/platform/client';

it('uses the same app chrome across pages and preserves the mounted manuscript, selection and undo', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
  const rects = Object.getOwnPropertyDescriptor(Range.prototype, 'getClientRects');
  const rect = Object.getOwnPropertyDescriptor(Range.prototype, 'getBoundingClientRect');
  Object.defineProperty(Range.prototype, 'getClientRects', { configurable: true, value: () => [] });
  Object.defineProperty(Range.prototype, 'getBoundingClientRect', {
    configurable: true,
    value: () => new DOMRect(),
  });
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const click = async (label: string) => {
    const button =
      host.querySelector<HTMLButtonElement>(`.binder-footer [aria-label="${label}"]`) ??
      [...host.querySelectorAll<HTMLButtonElement>('button')].find(
        (b) => b.getAttribute('aria-label') === label || b.textContent?.trim() === label,
      );
    expect(button, label).toBeTruthy();
    await act(async () => button!.click());
  };
  try {
    await request('create', {
      path: 'workspace-pages-synthetic',
      name: 'Continuité — synthétique',
    });
    await act(async () =>
      root.render(
        <ContextMenuProvider>
          <App />
        </ContextMenuProvider>,
      ),
    );
    const manuscript = host.querySelector<HTMLElement>('.cm-editor')!;
    expect(manuscript).toBeTruthy();
    const view = EditorView.findFromDOM(manuscript)!;
    await act(async () =>
      view.dispatch({
        changes: { from: 0, insert: 'Une phrase conservée.' },
        selection: { anchor: 7 },
      }),
    );
    const column = host.querySelector<HTMLElement>('.manuscript-column')!;
    column.scrollTop = 180;
    await click('Déplier la sidebar');
    const header = host.querySelector('.app-header'),
      sidebar = host.querySelector('#project-sidebar'),
      dock = host.querySelector('.binder-footer');
    for (const [control, title] of [
      ['Profil', 'Profil'],
      ['Paramètres', 'Paramètres'],
      ['Smart-tags', 'Smart-tags'],
      ['Boîte de réception', 'Boîte de réception'],
      ['Paramètres', 'Paramètres'],
    ] as const) {
      await click(control);
      expect(host.querySelector('.workspace-page-layout .workspace-page h1')?.textContent).toBe(
        title,
      );
      expect(host.querySelector('dialog[open]')).toBeNull();
      expect(host.querySelectorAll('.window-title')).toHaveLength(1);
      expect(host.querySelector('.app-header')).toBe(header);
      expect(host.querySelector('#project-sidebar')).toBe(sidebar);
      expect(host.querySelector('.binder-footer')).toBe(dock);
      expect(host.querySelector('.cm-editor')).toBe(manuscript);
      expect(host.querySelector<HTMLElement>('.writing-layout')?.hidden).toBe(true);
      expect(host.querySelector('.writing-layout')?.hasAttribute('inert')).toBe(true);
      expect(
        host.querySelector('.binder-footer [aria-current="page"]')?.getAttribute('aria-label'),
      ).toBe(control);
    }
    await click('Revenir au texte');
    expect(host.querySelector<HTMLElement>('.writing-layout')?.hidden).toBe(false);
    expect(view.state.selection.main.head).toBe(7);
    expect(column.scrollTop).toBe(180);
    expect(view.state.doc.toString()).toBe('Une phrase conservée.');
    await click('Versions');
    // The lazy module is allowed to settle without exercising model engines.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(host.querySelector('.history-editor h1')?.textContent).toBe('Versions');
    expect(host.querySelector('.cm-editor')).toBe(manuscript);
    await click('Revenir au texte');
    await act(async () => {
      undo(view);
    });
    expect(view.state.doc.toString()).toBe('');
  } finally {
    await act(async () => root.unmount());
    host.remove();
    localStorage.clear();
    if (rects) Object.defineProperty(Range.prototype, 'getClientRects', rects);
    if (rect) Object.defineProperty(Range.prototype, 'getBoundingClientRect', rect);
    vi.unstubAllGlobals();
  }
});
