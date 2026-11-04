import { StateEffect, StateField, type EditorState } from '@codemirror/state';
import { normalizedMatches } from './normalizedSearch';
import { Decoration, EditorView } from '@codemirror/view';

type Match = { from: number; to: number };
type SearchHighlight = { current: Match; text: string };
export type SearchDirection = 'first' | 'current' | 'next' | 'previous';

const setMatch = StateEffect.define<SearchHighlight | null>();
export const textSearchHighlight = StateField.define<SearchHighlight | null>({
  create: () => null,
  update(value, transaction) {
    if (transaction.docChanged) value = null;
    for (const effect of transaction.effects) if (effect.is(setMatch)) value = effect.value;
    return value;
  },
  provide: (field) =>
    EditorView.decorations.compute([field, 'doc'], (state) => {
      const highlight = state.field(field);
      if (!highlight) return Decoration.none;
      const ranges = [];
      for (const match of normalizedMatches(state.doc.toString(), highlight.text)) {
        const current = match.from === highlight.current.from && match.to === highlight.current.to;
        ranges.push(
          Decoration.mark({
            class: current ? 'cm-text-search-match current' : 'cm-text-search-match',
          }).range(match.from, match.to),
        );
      }
      return Decoration.set(ranges);
    }),
});

export function findTextMatch(
  state: EditorState,
  text: string,
  direction: SearchDirection = 'current',
): Match | null {
  if (!text) return null;
  const matches = normalizedMatches(state.doc.toString(), text);
  if (direction === 'first') return matches[0] ?? null;
  const selection = state.selection.main;
  if (direction === 'previous')
    return [...matches].reverse().find((m) => m.from < selection.from) ?? matches.at(-1) ?? null;
  const start = direction === 'next' ? selection.to : selection.from;
  return matches.find((m) => m.from >= start) ?? matches[0] ?? null;
}

export function highlightTextMatch(
  view: EditorView,
  text: string,
  direction: SearchDirection = 'current',
  preserveSelection = false,
  target?: Match | null,
) {
  const match = target === undefined ? findTextMatch(view.state, text, direction) : target;
  const previous = view.state.field(textSearchHighlight);
  const selection = view.state.selection.main;
  const clearSelection =
    !preserveSelection &&
    !match &&
    previous &&
    selection.from === previous.current.from &&
    selection.to === previous.current.to;
  view.dispatch({
    effects: match
      ? [
          setMatch.of({ current: match, text }),
          EditorView.scrollIntoView(match.from, { y: 'center' }),
        ]
      : [setMatch.of(null)],
    ...(match
      ? { selection: { anchor: match.from, head: match.to } }
      : clearSelection
        ? { selection: { anchor: selection.from } }
        : {}),
  });
}
