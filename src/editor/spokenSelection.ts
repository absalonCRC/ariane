import { StateEffect, StateField } from '@codemirror/state';
import { Decoration, EditorView, ViewPlugin } from '@codemirror/view';
import type { ViewUpdate } from '@codemirror/view';

const word = StateEffect.define<{ from: number; to: number } | null>();
const marks = StateField.define({
  create: () => Decoration.none,
  update(value, tr) {
    if (tr.docChanged || tr.selection) value = Decoration.none;
    for (const effect of tr.effects)
      if (effect.is(word)) {
        value = effect.value
          ? Decoration.set([
              Decoration.mark({ class: 'spoken-word' }).range(effect.value.from, effect.value.to),
            ])
          : Decoration.none;
      }
    return value;
  },
  provide: (field) => EditorView.decorations.from(field),
});
const lifetime = ViewPlugin.fromClass(
  class {
    invalidate?: () => void;
    update(u: ViewUpdate) {
      if (u.docChanged || u.selectionSet) this.invalidate?.();
    }
    destroy() {
      this.invalidate?.();
    }
  },
);
export const speechMarks = [marks, lifetime];
export function captureSpeech(view: EditorView, onChange: () => void) {
  const owner = view.plugin(lifetime);
  const { from, to } = view.state.selection.main;
  if (!owner || from === to) return null;
  owner.invalidate = onChange;
  return {
    text: view.state.sliceDoc(from, to),
    mark(offset: number, length: number) {
      if (owner.invalidate !== onChange || offset < 0 || length <= 0 || offset + length > to - from)
        return;
      view.dispatch({ effects: word.of({ from: from + offset, to: from + offset + length }) });
    },
    clear() {
      if (owner.invalidate === onChange) view.dispatch({ effects: word.of(null) });
    },
    release() {
      if (owner.invalidate !== onChange) return;
      owner.invalidate = undefined;
      // Invalidation may run inside a CodeMirror update or during destruction.
      queueMicrotask(() => {
        if (!owner.invalidate && view.dom.isConnected) view.dispatch({ effects: word.of(null) });
      });
    },
  };
}
