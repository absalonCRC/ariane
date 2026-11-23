// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { markdown } from '@codemirror/lang-markdown';
import { sectionMapping } from '../src/editor/composite';
import { footnoteScenes } from '../src/editor/footnoteReading';
import { liveMarkdown } from '../src/editor/markdown';

it('reads the local multiline definition and restores focus to the exact repeated call', () => {
  const first = 'A[^1]\n\n[^1]: Première.\n\n';
  const second = 'B[^1] et C[^1].\n\n`[^faux]`\n\n[^1]: Seconde.\n    Suite.';
  const doc = first + second;
  const mapping = sectionMapping([
    { id: 'a', title: 'A', from: 0, to: first.length },
    { id: 'b', title: 'B', from: first.length, to: doc.length },
  ]);
  const view = new EditorView({
    parent: document.body,
    state: EditorState.create({
      doc,
      extensions: [
        markdown(),
        mapping.extensions,
        footnoteScenes.of((s) => s.field(mapping.field)),
        liveMarkdown,
      ],
    }),
  });
  try {
    const calls = () => Array.from(view.dom.querySelectorAll<HTMLElement>('[data-footnote-at]'));
    expect(calls()).toHaveLength(3);
    calls()[2].click();
    expect(view.dom.querySelector('.footnote-reading')?.textContent).toBe('Seconde.\nSuite.');
    calls()[2].dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    expect(document.activeElement).toBe(calls()[2]);
    expect(view.dom.querySelector('.footnote-reading')).toBeNull();
    expect(view.state.doc.toString()).toBe(doc);
    expect(view.state.selection.main.head).toBe(0);
  } finally {
    view.destroy();
  }
});
