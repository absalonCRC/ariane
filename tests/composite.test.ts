import { describe, it, expect } from 'vitest';
import { ChangeSet } from '@codemirror/state';
import { compose, mapSpans, touchedSpans } from '../src/editor/composite';
const scene = (id: string, text: string) => ({
  id,
  text,
  parent: null,
  title: id,
  kind: 'scene' as const,
  position: 0,
  revision: 0,
  synopsis: '',
  status: '',
  goal: 0,
});
describe('Composite manuscript', () => {
  it('keeps stable scene boundaries after insertion', () => {
    const c = compose([scene('a', 'Bonjour'), scene('b', 'Suite')]);
    const ch = ChangeSet.of({ from: 3, insert: ' été' }, c.text.length);
    const spans = mapSpans(c.spans, ch);
    expect(spans[1].from).toBe(c.spans[1].from + 4);
    expect(touchedSpans(c.spans, ch)).toEqual(new Set(['a']));
  });
  it('maps an edit crossing multiple scenes without dropping text', () => {
    const c = compose([scene('a', 'Premier'), scene('b', 'Second')]);
    const ch = ChangeSet.of({ from: 3, to: 12, insert: 'texte' }, c.text.length);
    const mapped = mapSpans(c.spans, ch);
    expect(mapped[0].from).toBe(0);
    expect(mapped[0].to).toBe(mapped[1].from);
    expect(mapped[1].to).toBe(ch.newLength);
    expect(touchedSpans(c.spans, ch)).toEqual(new Set(['a', 'b']));
  });
  it('does not grow separators after save and reload', () => {
    const c = compose([scene('a', 'A'), scene('b', 'B')]);
    const parts = c.spans.map((s) => scene(s.id, c.text.slice(s.from, s.to)));
    expect(compose(parts).text).toBe(c.text);
  });
});

import { EditorState } from '@codemirror/state';
import { history, undo, redo } from '@codemirror/commands';
import { sectionMapping } from '../src/editor/composite';
it('restores scene ownership when undoing a cross-scene deletion', () => {
  const data = compose([scene('a', 'Premier'), scene('b', 'Second')]);
  const mapping = sectionMapping(data.spans);
  let state = EditorState.create({ doc: data.text, extensions: [history(), mapping.extensions] });
  state = state.update({ changes: { from: 3, to: 12, insert: 'texte' } }).state;
  expect(undo({ state, dispatch: (tr) => (state = tr.state) })).toBe(true);
  expect(state.doc.toString()).toBe(data.text);
  expect(state.field(mapping.field)).toEqual(data.spans);
  expect(redo({ state, dispatch: (tr) => (state = tr.state) })).toBe(true);
  expect(state.field(mapping.field)[0].to).toBe(state.field(mapping.field)[1].from);
});
