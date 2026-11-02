// @vitest-environment jsdom
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { expect, it } from 'vitest';
import { markdown } from '@codemirror/lang-markdown';
import { noteLinks } from '../src/editor/noteLinks';
import { wordFocus } from '../src/editor/focus';

it('follows the caret through accented words, apostrophes, hyphens, spaces and edits', () => {
  const text = '😀 L’élève Jean-Pierre écrit.\n\nUn autre mot.';
  const view = new EditorView({
    parent: document.body,
    state: EditorState.create({
      doc: text,
      selection: { anchor: text.indexOf('élève') + 2 },
      extensions: [wordFocus()],
    }),
  });
  const active = () => view.dom.querySelector('.focused-word')?.textContent;
  try {
    expect(active()).toBe('L’élève');
    view.dispatch({ selection: { anchor: text.indexOf('Pierre') + 2 } });
    expect(active()).toBe('Jean-Pierre');
    view.dispatch({ selection: { anchor: text.indexOf(' écrit') } });
    expect(active()).toBe('Jean-Pierre');
    const end = text.length;
    view.dispatch({ selection: { anchor: end } });
    expect(active()).toBe('mot');
    view.dispatch({ changes: { from: end - 1, to: end, insert: 's' }, selection: { anchor: end } });
    expect(active()).toBe('mots');
    view.dispatch({ selection: { anchor: text.indexOf('\n') + 1 } });
    expect(active()).toBeUndefined();
  } finally {
    view.destroy();
  }
});

it('focuses the visible title of a live note instead of its hidden source identifier', () => {
  const doc = 'Une langue : [Klingon](ariane://source/identifiant-cache) ';
  const view = new EditorView({
    parent: document.body,
    state: EditorState.create({
      doc,
      selection: { anchor: doc.length },
      extensions: [markdown(), noteLinks(() => {}), wordFocus()],
    }),
  });
  try {
    expect(view.dom.querySelector('.focused-word')?.textContent).toBe('Klingon');
    expect(view.dom.querySelector('.manuscript-note-link.focused-word')).not.toBeNull();
  } finally {
    view.destroy();
  }
});
