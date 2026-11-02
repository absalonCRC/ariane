// @vitest-environment jsdom
import { act, createRef } from 'react';
import { createRoot } from 'react-dom/client';
import { EditorView } from '@codemirror/view';
import { expect, it, vi } from 'vitest';
import { Settings } from '../src/app/Settings';
import { Editor, type EditorHandle } from '../src/editor/Editor';
import { defaultSettings, type Section } from '../src/app/types';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

it.each(['literary', 'sans', 'mono'] as const)(
  'keeps Markdown commands and live rendering functional with the %s font',
  async (font) => {
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    const editor = createRef<EditorHandle>();
    const changed = vi.fn();
    const rects = Object.getOwnPropertyDescriptor(Range.prototype, 'getClientRects');
    const rect = Object.getOwnPropertyDescriptor(Range.prototype, 'getBoundingClientRect');
    Object.defineProperty(Range.prototype, 'getClientRects', {
      configurable: true,
      value: () => [],
    });
    Object.defineProperty(Range.prototype, 'getBoundingClientRect', {
      configurable: true,
      value: () => new DOMRect(),
    });
    const section: Section = {
      id: 'page',
      parent: null,
      kind: 'scene',
      position: 0,
      title: 'Page',
      text: 'Gras Italique Barré Code\n\nTitre',
      revision: 0,
      synopsis: '',
      status: '',
      goal: 0,
    };
    const render = (currentFont: typeof font) =>
      root.render(
        <div className="app" data-writing-font={currentFont}>
          <Editor
            ref={editor}
            sections={[section]}
            generation={1}
            settings={{ ...defaultSettings, font: currentFont }}
            onChange={changed}
            onVisible={vi.fn()}
            onWords={vi.fn()}
            onCharacters={vi.fn()}
            onCursor={vi.fn()}
            onTyping={vi.fn()}
          />
          <Settings
            open
            value={{ ...defaultSettings, font: currentFont }}
            onChange={vi.fn()}
            onClose={vi.fn()}
            onFormat={(format) => editor.current?.format(format)}
            canFormat
          />
        </div>,
      );
    try {
      await act(async () => render(font));
      const view = EditorView.findFromDOM(host.querySelector('.cm-editor')!)!;
      const format = async (word: string, label: string) => {
        const from = view.state.doc.toString().indexOf(word);
        await act(async () =>
          view.dispatch({ selection: { anchor: from, head: from + word.length } }),
        );
        await act(async () =>
          host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!.click(),
        );
      };
      await format('Gras', 'Gras');
      await format('Italique', 'Italique');
      await format('Barré', 'Barré');
      await format('Code', 'Code en ligne');
      const titlePosition = view.state.doc.toString().indexOf('Titre');
      await act(async () => view.dispatch({ selection: { anchor: titlePosition } }));
      const select = host.querySelector<HTMLSelectElement>('select[aria-label="Niveau de titre"]')!;
      await act(async () => {
        select.value = 'heading-2';
        select.dispatchEvent(new Event('change', { bubbles: true }));
      });
      expect(editor.current?.text()).toBe('**Gras** *Italique* ~~Barré~~ `Code`\n\n## Titre');
      expect(changed.mock.calls.at(-1)?.[0].get('page')).toBe(editor.current?.text());
      expect(view.dom.querySelector('.md-strongemphasis')?.textContent).toContain('Gras');
      expect(view.dom.querySelector('.md-emphasis')?.textContent).toContain('Italique');
      expect(view.dom.querySelector('.md-strikethrough')?.textContent).toContain('Barré');
      expect(view.dom.querySelector('.md-inlinecode')?.textContent).toContain('Code');
      expect(view.dom.querySelector('.md-heading')?.textContent).toContain('Titre');
      changed.mockClear();
      const nextFont = font === 'literary' ? 'sans' : font === 'sans' ? 'mono' : 'literary';
      await act(async () => render(nextFont));
      expect(editor.current?.text()).toBe('**Gras** *Italique* ~~Barré~~ `Code`\n\n## Titre');
      expect(view.dom.querySelector('.md-strongemphasis')?.textContent).toContain('Gras');
      expect(view.dom.querySelector('.md-emphasis')?.textContent).toContain('Italique');
      expect(changed).not.toHaveBeenCalled();
    } finally {
      await act(async () => root.unmount());
      host.remove();
      if (rects) Object.defineProperty(Range.prototype, 'getClientRects', rects);
      else Reflect.deleteProperty(Range.prototype, 'getClientRects');
      if (rect) Object.defineProperty(Range.prototype, 'getBoundingClientRect', rect);
      else Reflect.deleteProperty(Range.prototype, 'getBoundingClientRect');
    }
  },
);
