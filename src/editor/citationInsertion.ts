import { EditorView } from '@codemirror/view';
import { isolateHistory } from '@codemirror/commands';
import type { Span } from './composite';

/** Insert at the current selection; keep note definitions at the scene end. */
export function citationChanges(text: string, _from: number, to: number, citation: string) {
  const definitionAt = citation.search(/\n\n(?=\[\^[^\]]+\]:)/);
  const definition = definitionAt >= 0 ? citation.slice(definitionAt).trim() : '';
  const body = (definitionAt >= 0 ? citation.slice(0, definitionAt) : citation).trim();
  const insert = body.startsWith('> ') ? `\n\n${body}\n\n` : body;
  const position = _from;
  const changes = [{ from: position, to, insert }];
  if (definition) {
    const end = Math.max(to, text.trimEnd().length);
    if (end === to) changes[0].insert = changes[0].insert.trimEnd() + `\n\n${definition}\n`;
    else changes.push({ from: end, to: end, insert: `\n\n${definition}\n` });
  }
  return { changes, cursor: position + insert.length };
}

export function prepareCitationInsertion(view: EditorView, spans: Span[], current: () => EditorView | null,
  selection: { from: number; to: number } = view.state.selection.main) {
  const doc = view.state.doc;
  const span = spans.find((s, index) => selection.from >= s.from && selection.to <= s.to &&
    (selection.from !== selection.to || selection.from < s.to || index === spans.length - 1));
  return (citation: string) => {
    if (!span || current() !== view || view.state.doc !== doc || view.state.readOnly) return false;
    const plan = citationChanges(doc.sliceString(span.from, span.to), selection.from - span.from,
      selection.to - span.from, citation);
    view.dispatch({ changes: plan.changes.map(c => ({ ...c, from: c.from + span.from, to: c.to + span.from })),
      selection: { anchor: span.from + plan.cursor }, annotations: isolateHistory.of('full') });
    view.focus();
    return true;
  };
}
