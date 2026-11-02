import { syntaxTree } from '@codemirror/language';
import {
  Decoration,
  EditorView,
  ViewPlugin,
  type DecorationSet,
  type ViewUpdate,
} from '@codemirror/view';
import { Facet, type EditorState, type Text } from '@codemirror/state';

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

// null means word focus is disabled; boolean selects caret or preview position.
export const wordFocusMode = Facet.define<boolean, boolean | null>({
  combine: (values) => (values.length ? values[values.length - 1] : null),
});

export function wordFocusRange(state: EditorState, previewAtEnd = false) {
  const head = previewAtEnd ? focusPreviewPosition(state.doc) : state.selection.main.head;
  const line = state.doc.lineAt(head);
  const offset = head - line.from;
  // Keep accents, apostrophes and internal hyphens in the same word.
  const words = /[\p{L}\p{N}][\p{L}\p{M}\p{N}]*(?:[’'\-][\p{L}\p{N}][\p{L}\p{M}\p{N}]*)*/gu;
  let active: { from: number; to: number } | undefined;
  for (const word of line.text.matchAll(words)) {
    const start = word.index!;
    let node = syntaxTree(state).resolveInner(line.from + start, 1);
    let hidden = false;
    let range = { from: line.from + start, to: line.from + start + word[0].length };
    for (;;) {
      if (node.name === 'URL') hidden = true;
      // A live note is an atomic widget: focus its visible title, never its hidden ID.
      if (node.name === 'Link' && state.sliceDoc(node.from, node.to).includes('](ariane://source/'))
        range = { from: node.from, to: node.to };
      if (!node.parent) break;
      node = node.parent;
    }
    if (hidden) continue;
    if (offset < start) {
      active ??= range;
      break;
    }
    active = range;
    if (offset <= start + word[0].length) break;
  }
  return active;
}

export function wordFocus(previewAtEnd = false) {
  return [
    wordFocusMode.of(previewAtEnd),
    ViewPlugin.fromClass(
      class {
        decorations: DecorationSet;
        constructor(view: EditorView) {
          this.decorations = this.build(view);
        }
        update(update: ViewUpdate) {
          if (update.selectionSet || update.docChanged || update.viewportChanged)
            this.decorations = this.build(update.view);
        }
        build(view: EditorView) {
          const active = wordFocusRange(view.state, previewAtEnd);
          return active
            ? Decoration.set([
                Decoration.mark({ class: 'focused-word' }).range(active.from, active.to),
              ])
            : Decoration.none;
        }
      },
      { decorations: (plugin) => plugin.decorations },
    ),
  ];
}
