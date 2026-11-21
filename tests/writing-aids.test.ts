// @vitest-environment jsdom
import { history, redo, undo } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { expect, it } from 'vitest';
import type { Section } from '../src/contracts/project';
import { compose, sectionMapping } from '../src/editor/composite';
import { nearbyOccurrences, nearbyRepetitions } from '../src/editor/nearbyRepetitions';
import { liveMarkdown } from '../src/editor/markdown';
import { outlineEditor } from '../src/editor/outline/state';
import {
  changeAid,
  editorAids,
  showWritingTrial,
  writeWithAid,
  writingAids,
} from '../src/editor/writingAids';
import { nextBlank } from '../src/project/writingAids';

const scene = (id: string, text: string): Section => ({
  id,
  text,
  parent: null,
  title: id,
  kind: 'scene',
  position: 0,
  revision: 0,
  synopsis: '',
  status: '',
  goal: 0,
});

function setup(sections: Section[]) {
  const { text, spans } = compose(sections);
  const mapping = sectionMapping(spans);
  const outline = outlineEditor(sections, spans, mapping.field);
  const view = new EditorView({
    state: EditorState.create({
      doc: text,
      extensions: [
        history(),
        markdown(),
        liveMarkdown,
        mapping.extensions,
        outline.extensions,
        writingAids(sections, mapping.field),
        nearbyRepetitions(mapping.field),
      ],
    }),
  });
  return { view, outline };
}

it('keeps blank and private hint in the same undo and redo as the text', () => {
  const { view } = setup([scene('one', 'Été 😀 ')]);
  try {
    const aid = {
      id: 'b',
      section: 'one',
      kind: 'blank',
      from: 7,
      quote: '[…]',
      value: 'privé',
    } as const;
    expect(writeWithAid(view, 7, 7, '[…]', aid)).toBe(true);
    expect(editorAids(view.state)).toEqual([aid]);
    expect(view.state.doc.toString()).toBe('Été 😀 […]');
    view.dispatch({ selection: { anchor: 0 } });
    expect(view.dom.querySelector('.cm-writing-blank')?.textContent).toBe('[…]');
    expect(writeWithAid(view, 7, 10, 'au phare', aid, true)).toBe(true);
    expect(editorAids(view.state)).toEqual([]);
    expect(undo(view)).toBe(true);
    expect(view.state.doc.toString()).toBe('Été 😀 […]');
    expect(editorAids(view.state)).toEqual([aid]);
    expect(redo(view)).toBe(true);
    expect(editorAids(view.state)).toEqual([]);
  } finally {
    view.destroy();
  }
  const sections = [scene('one', 'A […]'), scene('two', 'B […]')];
  expect(nextBlank(sections, 'one', 5)).toEqual({ section: 'two', from: 2 });
  expect(nextBlank(sections, 'two', 5)).toEqual({ section: 'one', from: 2 });
});

it('previews a trial without editing text, follows a move and restores a detached anchor on undo', () => {
  const { view, outline } = setup([scene('one', 'Premier\n\nLe vieux phare\n\nDernier')]);
  try {
    const aid = {
      id: 't',
      section: 'one',
      kind: 'trial',
      from: 9,
      quote: 'Le vieux phare',
      value: 'Le phare penchait',
    } as const;
    changeAid(view, aid);
    showWritingTrial(view, aid, true);
    expect(view.dom.querySelector('.cm-writing-trial')?.textContent).toBe(aid.value);
    expect(view.state.doc.toString()).toBe('Premier\n\nLe vieux phare\n\nDernier');
    showWritingTrial(view, aid);
    expect(view.dom.querySelector('.cm-writing-trial')?.textContent).toBe(aid.quote);
    view.dispatch({ selection: { anchor: 9 } });
    expect(outline.move(view, -1)).toBe(true);
    expect(editorAids(view.state)[0].from).toBe(0);
    view.dispatch({ changes: { from: 3, to: 8, insert: 'jeune' } });
    expect(editorAids(view.state)[0]).toMatchObject({ from: null, value: aid.value });
    expect(undo(view)).toBe(true);
    expect(editorAids(view.state)[0].from).toBe(0);
    expect(redo(view)).toBe(true);
    expect(editorAids(view.state)[0].from).toBeNull();
    expect(undo(view)).toBe(true);
    const [moved] = editorAids(view.state);
    expect(writeWithAid(view, 0, aid.quote.length, aid.value, moved, true)).toBe(true);
    expect(view.state.doc.toString().startsWith(aid.value)).toBe(true);
    expect(undo(view)).toBe(true);
    expect(editorAids(view.state)[0]).toEqual(moved);
  } finally {
    view.destroy();
  }
});

it('underlines normalized whole words in the three paragraphs and clears on Escape and typing', () => {
  const text =
    'pas éloigné\n\npas avant\nligne souple\n\npas passage pàS\n\nPAS ensuite\n\npas éloigné';
  const from = text.indexOf('pas passage');
  const section = scene('one', text);
  const state = EditorState.create({ doc: text, selection: { anchor: from, head: from + 3 } });
  const spans = compose([section]).spans;
  expect(nearbyOccurrences(state, spans).map((range) => text.slice(range.from, range.to))).toEqual([
    'pas',
    'pàS',
    'PAS',
  ]);
  const { view } = setup([section]);
  try {
    view.dispatch({ selection: { anchor: from, head: from + 3 } });
    expect(view.dom.querySelectorAll('.cm-nearby-repetition')).toHaveLength(3);
    view.contentDOM.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    );
    expect(view.dom.querySelectorAll('.cm-nearby-repetition')).toHaveLength(0);
    view.dispatch({ selection: { anchor: from + 12, head: from + 15 } });
    expect(view.dom.querySelectorAll('.cm-nearby-repetition')).toHaveLength(3);
    view.dispatch(view.state.replaceSelection('ici'));
    expect(view.dom.querySelectorAll('.cm-nearby-repetition')).toHaveLength(0);
  } finally {
    view.destroy();
  }
});
