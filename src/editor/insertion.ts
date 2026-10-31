import type { EditorView } from '@codemirror/view';

/** A dictation can append repeatedly, but never overwrite intervening edits. */
export function prepareTextInsertion(view: EditorView, current: () => EditorView | null) {
  let expected = view.state.doc;
  let { from, to } = view.state.selection.main;
  return (text: string): boolean => {
    if (current() !== view || view.state.doc !== expected) return false;
    const transaction = view.state.update({
      changes: { from, to, insert: text },
      selection: { anchor: from + text.length },
      userEvent: 'input.dictation',
    });
    view.dispatch(transaction);
    // A folded-content protection filter may have refused this insertion.
    if (!transaction.docChanged && text) return false;
    expected = view.state.doc;
    from = to = transaction.newSelection.main.head;
    view.focus();
    return true;
  };
}
