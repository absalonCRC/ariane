import { Prec, StateEffect, StateField, type EditorState } from '@codemirror/state';
import { Decoration, EditorView, keymap } from '@codemirror/view';
import type { Span } from './composite';
import { normalizedTerm } from './normalizedSearch';

const wordPattern = /[\p{L}\p{N}][\p{L}\p{N}\p{M}]*(?:['’‘ʼ][\p{L}\p{N}][\p{L}\p{N}\p{M}]*)*/gu;
const clear = StateEffect.define<void>();
const repetition = Decoration.mark({ class: 'cm-nearby-repetition' });

export function nearbyOccurrences(state: EditorState, spans: Span[]) {
  const { from, to } = state.selection.main;
  const selected = state.sliceDoc(from, to);
  const token = [...selected.matchAll(wordPattern)][0];
  if (!token || token[0] !== selected) return [];
  const span = spans.find((scene) => scene.from <= from && scene.to >= to);
  if (!span) return [];
  const line = state.doc.lineAt(from);
  // An empty line separates paragraphs. A soft line break stays inside one.
  let start = line.number;
  let end = line.number;
  const first = state.doc.lineAt(span.from).number;
  const last = state.doc.lineAt(span.to).number;
  for (let paragraphs = 0; start > first; start--) {
    if (!state.doc.line(start - 1).text.trim() && ++paragraphs > 1) break;
    while (start > first && !state.doc.line(start - 1).text.trim()) start--;
  }
  for (let paragraphs = 0; end < last; end++) {
    if (!state.doc.line(end + 1).text.trim() && ++paragraphs > 1) break;
    while (end < last && !state.doc.line(end + 1).text.trim()) end++;
  }
  const offset = Math.max(span.from, state.doc.line(start).from);
  const text = state.sliceDoc(offset, Math.min(span.to, state.doc.line(end).to));
  const term = normalizedTerm(selected);
  const matches = [...text.matchAll(wordPattern)];
  if (!matches.some((match) => match.index + offset === from && match[0].length === to - from))
    return [];
  return matches.flatMap((match) => {
    const position = offset + match.index;
    return position !== from && normalizedTerm(match[0]) === term
      ? [repetition.range(position, position + match[0].length)]
      : [];
  });
}

export function nearbyRepetitions(sectionField: StateField<Span[]>) {
  const field = StateField.define({
    create: () => Decoration.none,
    update(value, transaction) {
      if (
        transaction.docChanged ||
        transaction.state.readOnly ||
        transaction.effects.some((effect) => effect.is(clear))
      )
        return Decoration.none;
      if (
        !transaction.selection ||
        transaction.startState.selection.eq(transaction.state.selection)
      )
        return value;
      return Decoration.set(
        nearbyOccurrences(transaction.state, transaction.state.field(sectionField)),
      );
    },
    provide: (state) => EditorView.decorations.from(state),
  });
  return [
    field,
    Prec.highest(
      keymap.of([
        {
          key: 'Escape',
          run(view) {
            if (!view.state.field(field).size) return false;
            view.dispatch({ effects: clear.of() });
            return true;
          },
        },
      ]),
    ),
  ];
}
