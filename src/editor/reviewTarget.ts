import type { EditorView } from '@codemirror/view';
import { ensureSyntaxTree } from '@codemirror/language';
import { isolateHistory } from '@codemirror/commands';
import type { Span } from './composite';
import { protectedRanges, type Range, type ReviewSuggestion } from '../revision/suggestions';

export interface ReviewTarget {
  text: string;
  protected: Range[];
  isCurrent: () => boolean;
  apply: (suggestion: ReviewSuggestion) => boolean;
}
export function reviewTarget(
  view: EditorView,
  spans: Span[],
  current: () => EditorView | null,
): ReviewTarget | null {
  const selection = view.state.selection.main;
  const line = view.state.doc.lineAt(selection.head);
  const from = selection.empty ? line.from : selection.from;
  const to = selection.empty ? line.to : selection.to;
  if (from === to || !spans.some((s) => from >= s.from && to <= s.to)) return null;
  const tree = ensureSyntaxTree(view.state, to, 100);
  if (!tree) return null;
  let crossesProtected = false;
  const protectedNodes: Range[] = [];
  tree.iterate({
    from,
    to,
    enter(node) {
      if (!['InlineCode', 'FencedCode', 'CodeBlock', 'Link', 'Image', 'URL'].includes(node.name))
        return;
      if (node.from < to && node.to > from)
        protectedNodes.push({
          from: Math.max(0, node.from - from),
          to: Math.min(to - from, node.to - from),
        });
      if ((node.from < from && from < node.to) || (node.from < to && to < node.to))
        crossesProtected = true;
    },
  });
  // Wikilinks and autolinks may not be represented as complete syntax nodes.
  for (const edge of [view.state.doc.lineAt(from), view.state.doc.lineAt(to)]) {
    for (const range of protectedRanges(edge.text)) {
      const start = edge.from + range.from,
        end = edge.from + range.to;
      if ((start < from && from < end) || (start < to && to < end)) crossesProtected = true;
    }
  }
  if (crossesProtected) return null;
  const doc = view.state.doc;
  const text = doc.sliceString(from, to);
  return {
    text,
    protected: protectedNodes,
    isCurrent: () => current() === view && view.state.doc === doc,
    apply: (suggestion) => {
      if (
        current() !== view ||
        view.state.doc !== doc ||
        suggestion.from < 0 ||
        suggestion.to > text.length ||
        suggestion.from >= suggestion.to ||
        text.slice(suggestion.from, suggestion.to) !== suggestion.original
      )
        return false;
      view.dispatch({
        changes: {
          from: from + suggestion.from,
          to: from + suggestion.to,
          insert: suggestion.replacement,
        },
        annotations: isolateHistory.of('full'),
      });
      view.focus();
      return true;
    },
  };
}
