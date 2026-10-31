import { StateEffect, StateField, type EditorState } from '@codemirror/state';
import { SearchQuery } from '@codemirror/search';
import { Decoration, EditorView } from '@codemirror/view';

type Match = { from: number; to: number };
type SearchHighlight = { current: Match; text: string };
type Direction = 'current' | 'next' | 'previous';

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
      const cursor = new SearchQuery({ search: highlight.text, caseSensitive: false, literal: true }).getCursor(state);
      for (let result = cursor.next(); !result.done; result = cursor.next()) {
        const match = result.value;
        const current = match.from === highlight.current.from && match.to === highlight.current.to;
        ranges.push(Decoration.mark({ class: current ? 'cm-text-search-match current' : 'cm-text-search-match' }).range(match.from, match.to));
      }
      return Decoration.set(ranges);
    }),
});

export function findTextMatch(
  state: EditorState,
  text: string,
  direction: Direction = 'current',
): Match | null {
  if (!text) return null;
  const query = new SearchQuery({ search: text, caseSensitive: false, literal: true });
  const selection = state.selection.main;
  if (direction === 'previous') {
    const cursor = query.getCursor(state);
    let previous: Match | null = null;
    let last: Match | null = null;
    for (let result = cursor.next(); !result.done; result = cursor.next()) {
      last = result.value;
      if (result.value.from < selection.from) previous = result.value;
    }
    return previous ?? last;
  }
  const start = direction === 'next' ? selection.to : selection.from;
  const result = query.getCursor(state, start).next();
  if (!result.done) return result.value;
  const wrapped = query.getCursor(state).next();
  return wrapped.done ? null : wrapped.value;
}

export function highlightTextMatch(
  view: EditorView,
  text: string,
  direction: Direction = 'current',
  preserveSelection = false,
) {
  const match = findTextMatch(view.state, text, direction);
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
      ? [setMatch.of({ current: match, text }), EditorView.scrollIntoView(match.from, { y: 'center' })]
      : [setMatch.of(null)],
    ...(match
      ? { selection: { anchor: match.from, head: match.to } }
      : clearSelection
        ? { selection: { anchor: selection.from } }
        : {}),
  });
}
