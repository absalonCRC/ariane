import { EditorState } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import { isSingleCharacterTyping } from '../src/editor/smoothCaret';

describe('curseur pendant la frappe', () => {
  const state = EditorState.create({ doc: 'abc', selection: { anchor: 2 } });
  it('anime une insertion ou suppression ordinaire', () => {
    expect(
      isSingleCharacterTyping(
        state.update({ changes: { from: 2, insert: 'é' }, userEvent: 'input.type' }),
      ),
    ).toBe(true);
    expect(
      isSingleCharacterTyping(
        state.update({ changes: { from: 1, to: 2 }, userEvent: 'delete.backward' }),
      ),
    ).toBe(true);
  });
  it('évite les collages, compositions, sélections et déplacements importants', () => {
    expect(
      isSingleCharacterTyping(
        state.update({ changes: { from: 2, insert: 'plusieurs' }, userEvent: 'input.paste' }),
      ),
    ).toBe(false);
    expect(
      isSingleCharacterTyping(
        state.update({ changes: { from: 2, insert: 'é' }, userEvent: 'input.type.compose' }),
      ),
    ).toBe(false);
    expect(
      isSingleCharacterTyping(
        state.update({ changes: { from: 0, to: 2 }, userEvent: 'delete.backward' }),
      ),
    ).toBe(false);
    const selected = EditorState.create({ doc: 'abc', selection: { anchor: 0, head: 2 } });
    expect(
      isSingleCharacterTyping(
        selected.update({ changes: { from: 0, to: 2, insert: 'a' }, userEvent: 'input.type' }),
      ),
    ).toBe(false);
  });
});
