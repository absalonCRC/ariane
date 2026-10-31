import { EditorView, ViewPlugin } from '@codemirror/view';
import type { Transaction } from '@codemirror/state';

export function isSingleCharacterTyping(transaction: Transaction): boolean {
  if (
    transaction.isUserEvent('input.type.compose') ||
    !['input.type', 'delete.backward', 'delete.forward'].some((event) =>
      transaction.isUserEvent(event),
    ) ||
    !transaction.startState.selection.main.empty ||
    transaction.startState.selection.ranges.length !== 1 ||
    !transaction.state.selection.main.empty
  )
    return false;
  const cursor = transaction.startState.selection.main.head;
  let count = 0,
    valid = false;
  transaction.changes.iterChanges((from, to, _fromB, _toB, inserted) => {
    count++;
    const removed = transaction.startState.sliceDoc(from, to);
    const added = inserted.toString();
    valid =
      (from === cursor && to === cursor && Array.from(added).length === 1 && added !== '\n') ||
      (added === '' &&
        Array.from(removed).length === 1 &&
        removed !== '\n' &&
        (to === cursor || from === cursor));
  });
  return count === 1 && valid;
}

/** Animate single arrow-key moves, including transitions to adjacent visual lines. */
export const smoothCaret = ViewPlugin.fromClass(
  class {
    private timeout: ReturnType<typeof setTimeout> | undefined;
    private inputDecision: boolean | undefined;

    constructor(readonly view: EditorView) {}

    reset() {
      clearTimeout(this.timeout);
      delete this.view.dom.dataset.smoothCaret;
    }

    activate() {
      clearTimeout(this.timeout);
      this.view.dom.dataset.smoothCaret = 'true';
      this.timeout = setTimeout(() => this.reset(), 220);
    }

    keydown(event: KeyboardEvent) {
      const { view } = this;
      const range = view.state.selection.main;
      const typing =
        (Array.from(event.key).length === 1 ||
          event.key === 'Backspace' ||
          event.key === 'Delete') &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !event.isComposing;
      if (!typing) this.reset();
      this.inputDecision = undefined;
      if (
        event.isComposing ||
        view.composing ||
        event.shiftKey ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        !range.empty ||
        view.state.selection.ranges.length !== 1
      )
        return false;

      const horizontal = event.key === 'ArrowLeft' || event.key === 'ArrowRight';
      const vertical = event.key === 'ArrowUp' || event.key === 'ArrowDown';
      if (!horizontal && !vertical) return false;

      const next = horizontal
        ? view.moveByChar(range, event.key === 'ArrowRight')
        : view.moveVertically(range, event.key === 'ArrowDown');
      if (next.head === range.head && next.assoc === range.assoc) return false;
      const from = view.coordsAtPos(range.head, range.assoc < 0 ? -1 : 1);
      const to = view.coordsAtPos(next.head, next.assoc < 0 ? -1 : 1);
      if (!from || !to) return false;
      const dx = Math.abs(to.left - from.left);
      const dy = Math.abs(to.top - from.top);
      const maxX = Math.max(48, view.defaultCharacterWidth * 4);
      if (dy > view.defaultLineHeight * 2 || (horizontal && dy <= 2 && dx > maxX)) return false;

      this.activate();
      return false;
    }

    beforeinput(event: InputEvent) {
      this.inputDecision = false;
      const { view } = this;
      const range = view.state.selection.main;
      if (
        event.isComposing ||
        view.composing ||
        !range.empty ||
        view.state.selection.ranges.length !== 1
      )
        return false;
      const insert =
        event.inputType === 'insertText' && event.data !== null && [...event.data].length === 1;
      const backward = event.inputType === 'deleteContentBackward';
      const forward = event.inputType === 'deleteContentForward';
      if (!insert && !backward && !forward) {
        this.reset();
        return false;
      }
      const caret = view.coordsAtPos(range.head);
      if (!caret) return false;
      const content = view.contentDOM.getBoundingClientRect();
      const margin = Math.max(24, view.defaultCharacterWidth * 3);
      // Avoid a long horizontal animation when editing causes a wrapped line to change.
      if (
        (insert && content.right - caret.left < margin) ||
        (backward && caret.left - content.left < margin)
      )
        return false;
      this.inputDecision = true;
      this.activate();
      return false;
    }

    update(update: import('@codemirror/view').ViewUpdate) {
      if (!update.docChanged) return;
      if (
        !update.view.composing &&
        this.inputDecision !== false &&
        update.transactions.some(isSingleCharacterTyping)
      )
        this.activate();
      else this.reset();
      this.inputDecision = undefined;
    }

    destroy() {
      this.reset();
    }
  },
  {
    eventHandlers: {
      keydown(event) {
        return this.keydown(event);
      },
      pointerdown() {
        this.reset();
        return false;
      },
      beforeinput(event) {
        return this.beforeinput(event);
      },
      blur() {
        this.reset();
        return false;
      },
      compositionstart() {
        this.reset();
        return false;
      },
    },
  },
);
