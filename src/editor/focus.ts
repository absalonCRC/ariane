import {
  Decoration,
  EditorView,
  ViewPlugin,
  type DecorationSet,
  type ViewUpdate,
} from '@codemirror/view';
import type { Text } from '@codemirror/state';

// Ignore empty trailing lines and spaces: an invisible caret there cannot illustrate a mode.
export function focusPreviewPosition(doc: Text): number {
  for (let number = doc.lines; number > 0; number--) {
    const line = doc.line(number);
    const lastCharacter = line.text.search(/\s*$/u);
    if (lastCharacter > 0) return line.from + lastCharacter;
  }
  return 0;
}

export function sentenceFocus(previewAtEnd = false) {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(v: EditorView) {
        this.decorations = this.build(v);
      }
      update(u: ViewUpdate) {
        if (u.selectionSet || u.docChanged || u.viewportChanged)
          this.decorations = this.build(u.view);
      }
      build(v: EditorView) {
        const head = previewAtEnd ? focusPreviewPosition(v.state.doc) : v.state.selection.main.head;
        const line = v.state.doc.lineAt(head);
        const offset = head - line.from;
        const sentence = /[^.!?]+[.!?]?/gu;
        for (const match of line.text.matchAll(sentence)) {
          const start = match.index || 0;
          const end = start + match[0].length;
          if (offset >= start && offset <= end && end > start)
            return Decoration.set([
              Decoration.mark({ class: 'focused-sentence' }).range(
                line.from + start,
                line.from + end,
              ),
            ]);
        }
        return Decoration.none;
      }
    },
    { decorations: (v) => v.decorations },
  );
}

export function paragraphFocus(previewAtEnd = false) {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = this.build(view);
      }
      update(u: ViewUpdate) {
        if (u.selectionSet || u.docChanged || u.viewportChanged)
          this.decorations = this.build(u.view);
      }
      build(view: EditorView) {
        const doc = view.state.doc;
        const line = doc.lineAt(
          previewAtEnd ? focusPreviewPosition(doc) : view.state.selection.main.head,
        );
        let first = line.number,
          last = line.number;
        if (line.text.trim()) {
          while (first > 1 && doc.line(first - 1).text.trim()) first--;
          while (last < doc.lines && doc.line(last + 1).text.trim()) last++;
        }
        const marks = [];
        for (let n = first; n <= last; n++) {
          const from = doc.line(n).from;
          if (view.visibleRanges.some((r) => from >= r.from && from <= r.to))
            marks.push(Decoration.line({ class: 'focused-line' }).range(from));
        }
        return Decoration.set(marks);
      }
    },
    { decorations: (plugin) => plugin.decorations },
  );
}
