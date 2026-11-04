// @vitest-environment jsdom
import { beforeAll, afterAll, afterEach, expect, it, vi } from 'vitest';
import { act, createElement, createRef } from 'react';
import { createRoot } from 'react-dom/client';
import { Editor, type EditorHandle } from '../src/editor/Editor';
import { defaultSettings } from '../src/contracts/settings';
import { type Section } from '../src/contracts/project';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { defaultKeymap } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { noteCommands, noteTrigger, noteContext, noteLink } from '../src/editor/noteCommands';
import { type NoteRef } from '../src/contracts/notes';
import { noteLinks, setNoteLinkData } from '../src/editor/noteLinks';
const originalRects = Object.getOwnPropertyDescriptor(Range.prototype, 'getClientRects');
const originalRect = Object.getOwnPropertyDescriptor(Range.prototype, 'getBoundingClientRect');
beforeAll(() => {
  Object.defineProperty(Range.prototype, 'getClientRects', { configurable: true, value: () => [] });
  Object.defineProperty(Range.prototype, 'getBoundingClientRect', {
    configurable: true,
    value: () => new DOMRect(),
  });
});
afterAll(() => {
  if (originalRects) Object.defineProperty(Range.prototype, 'getClientRects', originalRects);
  else Reflect.deleteProperty(Range.prototype, 'getClientRects');
  if (originalRect) Object.defineProperty(Range.prototype, 'getBoundingClientRect', originalRect);
  else Reflect.deleteProperty(Range.prototype, 'getBoundingClientRect');
});
const note: NoteRef = {
  id: 'vault:Claude',
  title: 'Claude Nougaro',
  kind: 'Personne',
  path: 'Personnes/Claude Nougaro.md',
  vaultId: 'vault',
};
const views: EditorView[] = [];
afterEach(() => {
  views.splice(0).forEach((v) => v.destroy());
  document.body.replaceChildren();
});
function setup(doc: string, lookup = vi.fn(async () => [note]), create = vi.fn(async () => note)) {
  const onError = vi.fn();
  const parent = document.body.appendChild(document.createElement('div'));
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc,
      selection: { anchor: doc.length },
      extensions: [
        markdown(),
        keymap.of(defaultKeymap),
        noteCommands({ lookup, create, isCurrent: (v) => views.includes(v), onError }),
      ],
    }),
  });
  views.push(view);
  return { view, lookup, create, onError };
}
function key(view: EditorView, key: string) {
  view.contentDOM.dispatchEvent(
    new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }),
  );
}
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
it('recognizes @ and + names but preserves code, emails, sums and list continuations', () => {
  for (const text of ['@claudenougaro', 'Texte + Ma note']) {
    const state = EditorState.create({
      doc: text,
      selection: { anchor: text.length },
      extensions: [markdown()],
    });
    expect(noteTrigger(state)?.query).toBe(text.startsWith('@') ? 'claudenougaro' : 'Ma note');
  }
  for (const text of ['foo@bar', '`@Claude', '```\n@Claude', '2 + Claude', '- item\n+ Claude']) {
    const state = EditorState.create({
      doc: text,
      selection: { anchor: text.length },
      extensions: [markdown()],
    });
    expect(noteTrigger(state)).toBeNull();
  }
});
it('Enter invokes an existing note even before autocomplete is ready', async () => {
  const { view, lookup, create } = setup('@claudenougaro');
  key(view, 'Enter');
  await flush();
  expect(lookup).toHaveBeenCalledWith('claudenougaro');
  expect(create).not.toHaveBeenCalled();
  expect(view.state.doc.toString()).toBe(noteLink(note) + ' ');
});
it('plus Enter creates once and Escape cancels the command', async () => {
  const { view, create } = setup('+ Claude Nougaro');
  key(view, 'Enter');
  key(view, 'Enter');
  await flush();
  expect(create).toHaveBeenCalledTimes(1);
  expect(view.state.doc.toString()).toBe(noteLink(note) + ' ');
  const cancelled = setup('+ Autre note');
  key(cancelled.view, 'Escape');
  key(cancelled.view, 'Enter');
  await flush();
  expect(cancelled.create).not.toHaveBeenCalled();
});
it('never replaces newer text when note creation completes', async () => {
  let resolve!: (n: NoteRef) => void;
  const create = vi.fn(() => new Promise<NoteRef>((r) => (resolve = r)));
  const { view, onError } = setup('+ Claude', undefined, create);
  key(view, 'Enter');
  view.dispatch({ changes: { from: view.state.doc.length, insert: ' suite' } });
  resolve(note);
  await flush();
  expect(view.state.doc.toString()).toBe('+ Claude suite');
  expect(onError).toHaveBeenCalled();
});
it('renders a clickable note outside the cursor and preserves its Markdown', () => {
  const open = vi.fn(),
    doc = noteLink(note) + ' après';
  const view = new EditorView({
    parent: document.body,
    state: EditorState.create({
      doc,
      selection: { anchor: doc.length },
      extensions: [markdown(), noteLinks(open)],
    }),
  });
  views.push(view);
  const button = document.querySelector<HTMLButtonElement>('.manuscript-note-link')!;
  expect(button.textContent).toBe(note.title);
  button.click();
  expect(open).toHaveBeenCalledWith(note.id);
  expect(view.state.doc.toString()).toBe(doc);
});

it.each(['@Claude', '+ Claude', '+Claude'])(
  'Enter consumes the command then restores newline for %s',
  async (text) => {
    const { view } = setup(text);
    key(view, 'Enter');
    await flush();
    expect(view.state.doc.toString()).toBe(noteLink(note) + ' ');
    expect(view.state.doc.lines).toBe(1);
    key(view, 'Enter');
    expect(view.state.doc.toString()).toBe(noteLink(note) + ' \n');
    expect(view.state.doc.lines).toBe(2);
  },
);

it.each(['@Claude', '+ Claude', '+Claude'])(
  'the complete live Markdown editor validates %s before outline Enter',
  async (text) => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const host = document.body.appendChild(document.createElement('div')),
      root = createRoot(host),
      ref = createRef<EditorHandle>();
    const section: Section = {
      id: 's',
      parent: null,
      kind: 'scene',
      position: 0,
      title: 'Test',
      text,
      revision: 1,
      synopsis: '',
      status: '',
      goal: 0,
    };
    try {
      await act(async () =>
        root.render(
          createElement(Editor, {
            ref,
            sections: [section],
            generation: 1,
            settings: { ...defaultSettings, cursor: text.length },
            noteLookup: async () => [note],
            noteCreate: async () => note,
            onChange: vi.fn(),
            onVisible: vi.fn(),
            onWords: vi.fn(),
            onCharacters: vi.fn(),
            onCursor: vi.fn(),
            onTyping: vi.fn(),
          }),
        ),
      );
      const content = host.querySelector('.cm-content')!;
      await act(async () => {
        content.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
        );
        await flush();
      });
      expect(ref.current?.text()).toBe(noteLink(note) + ' ');
      expect(host.querySelector('.manuscript-note-link')?.textContent).toBe(note.title);
      await act(async () => {
        content.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
        );
      });
      expect(ref.current?.text()).toBe(noteLink(note) + ' \n');
    } finally {
      await act(async () => root.unmount());
      host.remove();
    }
  },
);

it('updates a linked note colour when classification or preferences change', () => {
  const open = vi.fn();
  const doc = noteLink(note) + ' suite';
  const view = new EditorView({
    parent: document.body,
    state: EditorState.create({
      doc,
      selection: { anchor: doc.length },
      extensions: [markdown(), noteLinks(open)],
    }),
  });
  views.push(view);
  view.dispatch({
    effects: setNoteLinkData.of({ notes: [note], colors: { Personne: '#cc1122' } }),
  });
  expect(document.querySelector<HTMLButtonElement>('.manuscript-note-link')!.style.color).toBe(
    'rgb(204, 17, 34)',
  );
  view.dispatch({
    effects: setNoteLinkData.of({
      notes: [{ ...note, kind: 'Dynastie' }],
      colors: { Dynastie: '#1133cc' },
    }),
  });
  expect(document.querySelector<HTMLButtonElement>('.manuscript-note-link')!.style.color).toBe(
    'rgb(17, 51, 204)',
  );
  view.dispatch({ effects: setNoteLinkData.of({ enabled: false }) });
  const link = document.querySelector<HTMLButtonElement>('.manuscript-note-link')!;
  expect(link.style.color).toBe('inherit');
  link.click();
  expect(open).toHaveBeenCalledWith(note.id);
  expect(view.state.doc.toString()).toBe(doc);
  view.dispatch({ effects: setNoteLinkData.of({ enabled: true }) });
  expect(document.querySelector<HTMLButtonElement>('.manuscript-note-link')!.style.color).toBe(
    'rgb(17, 51, 204)',
  );
});

it('classifies only the target line, without unrelated links or paragraphs', () => {
  const doc = noteLink(note) + '\n+Ordre du Phénix';
  const state = EditorState.create({
    doc,
    selection: { anchor: doc.length },
    extensions: [markdown()],
  });
  expect(noteContext(state, noteTrigger(state)!)).toBe('');
  const line = 'Le pays voisin se nomme +Qorûn';
  const contextual = EditorState.create({
    doc: line,
    selection: { anchor: line.length },
    extensions: [markdown()],
  });
  expect(noteContext(contextual, noteTrigger(contextual)!)).toBe('Le pays voisin se nomme Qorûn');
});
