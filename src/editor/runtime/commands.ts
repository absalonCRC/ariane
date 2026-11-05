import type { OutlineEditor } from '../outline/state';
import type { RefObject } from 'react';
import type { EditorHandle, EditorProps as Props } from '../types';
import { EditorView } from '@codemirror/view';
import { isolateHistory } from '@codemirror/commands';
import { focusTableCell } from '../liveTables';
import { type Span } from '../composite';
import { prepareTextInsertion } from '../insertion';
import { documentBounds } from '../scrolling';
import { findTextMatch, highlightTextMatch } from '../textSearch';
import { formatMarkdown } from '../formatMarkdown';
import { prepareCitationInsertion } from '../citationInsertion';
import { reviewTarget } from '../reviewTarget';
interface RuntimeRefs {
  view: RefObject<EditorView | null>;
  outlineRef: RefObject<OutlineEditor | null>;
  spans: RefObject<Span[]>;
  latest: RefObject<Props>;
}
export function createEditorHandle({ view, outlineRef, spans, latest }: RuntimeRefs): EditorHandle {
  return {
    context() {
      const v = view.current,
        outline = outlineRef.current;
      if (!v || !outline) return null;
      const cursor = v.state.selection.main.head;
      const span = spans.current.find((s) => cursor >= s.from && cursor <= s.to);
      if (!span) return null;
      const entry = [...v.state.field(outline.field).nodes]
        .reverse()
        .find((n) => n.section === span.id && n.from <= cursor);
      const persisted = latest.current.sections.find((s) => s.id === span.id)?.outline;
      return {
        section: span.id,
        node: persisted ? (entry?.id ?? null) : null,
        offset: cursor - (entry?.from ?? span.from),
        cursor,
      };
    },
    contextTop(section, node) {
      const v = view.current,
        outline = outlineRef.current;
      if (!v || !outline) return null;
      const from = node
        ? v.state.field(outline.field).nodes.find((n) => n.section === section && n.id === node)
            ?.from
        : spans.current.find((s) => s.id === section)?.from;
      if (from === undefined) return null;
      const top = v.coordsAtPos(from)?.top;
      const bounds = documentBounds(v);
      return top !== undefined && top >= bounds.top && top < bounds.bottom - 35 ? top : null;
    },
    restoreContext(context) {
      const v = view.current,
        outline = outlineRef.current;
      if (!v || !outline) return false;
      const span = spans.current.find((s) => s.id === context.section);
      if (!span) return false;
      const nodes = v.state.field(outline.field).nodes;
      const entry = nodes.find((n) => n.section === context.section && n.id === context.node);
      if (entry) outline.reveal(v, entry.id);
      const next = entry ? (nodes.find((n) => n.from > entry.from)?.from ?? span.to) : span.to;
      const position = entry
        ? Math.min(entry.from + context.offset, next)
        : Math.min(span.to, Math.max(span.from, context.cursor));
      v.dispatch({
        selection: { anchor: position },
        effects: EditorView.scrollIntoView(position, { y: 'center' }),
      });
      return true;
    },
    insert(text) {
      const v = view.current;
      if (!v) return;
      v.dispatch(v.state.replaceSelection(text));
      v.focus();
    },
    text: () => view.current?.state.doc.toString() || '',
    focus: () => view.current?.focus(),
    structure(command) {
      const v = view.current,
        outline = outlineRef.current;
      if (!v || !outline) return;
      if (command === 'up' || command === 'down') outline.move(v, command === 'up' ? -1 : 1);
      else if (command === 'fold') outline.toggleFold(v);
      else outline[command](v);
      v.focus();
    },
    format: (format) => {
      const v = view.current;
      if (!v || !spans.current.length) return;
      v.dispatch({
        ...formatMarkdown(v.state, format, spans.current),
        annotations: isolateHistory.of('full'),
      });
      if (format !== 'table' || !focusTableCell(v, v.state.selection.main.from)) v.focus();
    },
    revealNode: (id) =>
      view.current && outlineRef.current ? outlineRef.current.reveal(view.current, id) : false,
    findText: (query, direction) => {
      const v = view.current;
      if (!v) return;
      const match = findTextMatch(v.state, query, direction);
      const outline = outlineRef.current;
      const node =
        match && outline
          ? [...v.state.field(outline.field).nodes].reverse().find((n) => n.from <= match.from)
          : null;
      if (node && outline) outline.reveal(v, node.id, false);
      highlightTextMatch(v, query, direction, false, match);
    },
    revealMatch(section, from, query) {
      const v = view.current,
        outline = outlineRef.current;
      const span = spans.current.find((s) => s.id === section);
      if (!v || !span) return false;
      const position = Math.min(span.to, span.from + (from ?? 0));
      const node = outline
        ? [...v.state.field(outline.field).nodes]
            .reverse()
            .find((n) => n.section === section && n.from <= position)
        : null;
      if (node && outline) outline.reveal(v, node.id);
      v.dispatch({
        selection: { anchor: position },
        effects: EditorView.scrollIntoView(position, { y: 'center' }),
      });
      highlightTextMatch(v, from === null ? '' : query, 'current', true);
      return true;
    },
    clearTextSearch: () => {
      if (view.current) highlightTextMatch(view.current, '', 'current', true);
    },
    selection: () => {
      const v = view.current;
      if (!v) return '';
      const s = v.state.selection.main;
      return v.state.sliceDoc(s.from, s.to);
    },
    cursor: () => view.current?.state.selection.main.head || 0,
    reviewTarget: () =>
      view.current ? reviewTarget(view.current, spans.current, () => view.current) : null,
    passage() {
      const v = view.current;
      if (!v) return null;
      const selection = v.state.selection.main;
      const span = spans.current.find((s) => selection.from >= s.from && selection.to <= s.to);
      return span
        ? {
            section: span.id,
            from: selection.from - span.from,
            to: selection.to - span.from,
            text: v.state.sliceDoc(selection.from, selection.to),
          }
        : null;
    },
    prepareCitation() {
      return view.current
        ? prepareCitationInsertion(view.current, spans.current, () => view.current)
        : () => false;
    },
    prepareInsertion() {
      const v = view.current;
      if (!v) return () => false;
      return prepareTextInsertion(v, () => view.current);
    },
  };
}
