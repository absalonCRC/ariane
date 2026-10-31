import { EditorState } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import { findTextMatch } from '../src/editor/textSearch';

describe('recherche dans le texte', () => {
  const doc = 'Début Claude Nougaro, puis CLAUDE NOUGARO.';
  const state = (anchor: number, head = anchor) =>
    EditorState.create({ doc, selection: { anchor, head } });
  const first = { from: 6, to: 20 };
  const second = { from: 27, to: 41 };

  it('cherche sans distinguer les majuscules et revient au début', () => {
    expect(findTextMatch(state(0), 'claude nougaro')).toMatchObject(first);
    expect(findTextMatch(state(doc.length), 'Claude Nougaro')).toMatchObject(first);
    expect(findTextMatch(state(0), 'absent')).toBeNull();
    expect(findTextMatch(state(0), '')).toBeNull();
  });

  it('navigue entre les occurrences dans les deux sens', () => {
    expect(findTextMatch(state(first.from, first.to), 'Claude Nougaro', 'next')).toMatchObject(
      second,
    );
    expect(findTextMatch(state(second.from, second.to), 'Claude Nougaro', 'next')).toMatchObject(
      first,
    );
    expect(
      findTextMatch(state(second.from, second.to), 'Claude Nougaro', 'previous'),
    ).toMatchObject(first);
    expect(findTextMatch(state(first.from, first.to), 'Claude Nougaro', 'previous')).toMatchObject(
      second,
    );
  });
});
