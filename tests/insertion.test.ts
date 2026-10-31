// @vitest-environment jsdom
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { expect, it } from 'vitest';
import { prepareTextInsertion } from '../src/editor/insertion';

it('insère les fragments de dictée à la suite sans remplacer les précédents', () => {
  const view = new EditorView({
    state: EditorState.create({ doc: 'Avant ancien après', selection: { anchor: 6, head: 12 } }),
    parent: document.body,
  });
  const insert = prepareTextInsertion(view, () => view);
  expect(insert('Bonjour')).toBe(true);
  expect(insert(' le monde.')).toBe(true);
  expect(view.state.doc.toString()).toBe('Avant Bonjour le monde. après');
  view.dispatch({ changes: { from: 0, insert: 'Édition : ' } });
  expect(insert(' Ne pas écraser.')).toBe(false);
  expect(view.state.doc.toString()).toBe('Édition : Avant Bonjour le monde. après');
  view.destroy();
});
