// @vitest-environment jsdom
import { act, createRef } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { Editor, type EditorHandle } from '../src/editor/Editor';
import { EditorView } from '@codemirror/view';
import { defaultSettings, type Section } from '../src/app/types';
vi.mock('../src/app/client', () => ({ native: false, request: vi.fn(async () => []) }));
it('keeps the search input focused and navigates with arrows from the editor', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const rects = Object.getOwnPropertyDescriptor(Range.prototype, 'getClientRects');
  const rect = Object.getOwnPropertyDescriptor(Range.prototype, 'getBoundingClientRect');
  Object.defineProperty(Range.prototype, 'getClientRects', { configurable: true, value: () => [] });
  Object.defineProperty(Range.prototype, 'getBoundingClientRect', {
    configurable: true,
    value: () => new DOMRect(),
  });
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host),
    handle = createRef<EditorHandle>();
  const text = 'La lune et encore la lune.';
  const section = {
    id: 's',
    title: 'Texte',
    text,
    parent: null,
    kind: 'scene',
    position: 0,
    revision: 0,
    synopsis: '',
    status: '',
    goal: 0,
  } as Section;
  try {
    await act(async () =>
      root.render(
        <>
          <input aria-label="Recherche de test" />
          <Editor
            ref={handle}
            sections={[section]}
            generation={1}
            settings={defaultSettings}
            searchQuery="lune"
            onChange={vi.fn()}
            onVisible={vi.fn()}
            onWords={vi.fn()}
            onCharacters={vi.fn()}
            onCursor={vi.fn()}
            onTyping={vi.fn()}
          />
        </>,
      ),
    );
    const input = host.querySelector('input')!;
    input.focus();
    await act(async () => handle.current!.findText('lune', 'first'));
    expect(document.activeElement).toBe(input);
    const view = EditorView.findFromDOM(host.querySelector('.cm-editor')!)!;
    expect(view.state.selection.main.from).toBe(3);
    view.focus();
    await act(async () =>
      view.contentDOM.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }),
      ),
    );
    expect(view.state.selection.main.from).toBe(21);
    await act(async () =>
      view.contentDOM.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }),
      ),
    );
    expect(view.state.selection.main.from).toBe(3);
  } finally {
    await act(async () => root.unmount());
    host.remove();
    if (rects) Object.defineProperty(Range.prototype, 'getClientRects', rects);
    else Reflect.deleteProperty(Range.prototype, 'getClientRects');
    if (rect) Object.defineProperty(Range.prototype, 'getBoundingClientRect', rect);
    else Reflect.deleteProperty(Range.prototype, 'getBoundingClientRect');
  }
});
