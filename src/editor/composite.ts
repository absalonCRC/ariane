import type { Section } from '../contracts/project';
import { ChangeDesc } from '@codemirror/state';
import { StateField, StateEffect } from '@codemirror/state';
import { invertedEffects } from '@codemirror/commands';
export interface Span {
  id: string;
  from: number;
  to: number;
  title: string;
}
export function compose(sections: Section[]) {
  let text = '';
  const spans: Span[] = [];
  sections.forEach((s, i) => {
    const from = text.length;
    text += s.text;
    if (i < sections.length - 1 && !text.endsWith('\n\n')) text += '\n\n';
    spans.push({ id: s.id, from, to: text.length, title: s.title });
  });
  return { text, spans };
}
export function mapSpans(spans: Span[], changes: ChangeDesc): Span[] {
  return spans.map((s, i) => ({
    ...s,
    from: i ? changes.mapPos(s.from, -1) : 0,
    to: i === spans.length - 1 ? changes.newLength : changes.mapPos(s.to, -1),
  }));
}
export function touchedSpans(spans: Span[], changes: ChangeDesc): Set<string> {
  const ids = new Set<string>();
  changes.iterChangedRanges((from, to) => {
    for (const s of spans) {
      if (from <= s.to && to >= s.from) ids.add(s.id);
    }
  });
  return ids;
}



/** Scene ownership is part of undo history, including edits spanning scenes. */
export function sectionMapping(initial: Span[]) {
  const restore = StateEffect.define<Span[]>({ map: (value, changes) => mapSpans(value, changes) });
  const field = StateField.define<Span[]>({
    create: () => initial,
    update(value, tr) {
      for (const e of tr.effects) if (e.is(restore)) return e.value;
      return tr.docChanged ? mapSpans(value, tr.changes) : value;
    },
  });
  const inversion = invertedEffects.of((tr) =>
    tr.docChanged ? [restore.of(tr.startState.field(field))] : [],
  );
  return { field, extensions: [field, inversion] };
}
