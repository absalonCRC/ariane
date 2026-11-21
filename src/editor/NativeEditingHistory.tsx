import { redo, undo } from '@codemirror/commands';
import { EditorView } from '@codemirror/view';
import { useEffect } from 'react';
import { native } from '../platform/client';

type Action = 'history-undo' | 'history-redo';
type Origin = 'keyboard' | 'menu';

export function NativeEditingHistory() {
  useEffect(() => {
    if (!native || !/Mac/.test(navigator.platform)) return;
    let disposed = false;
    let stop: (() => void) | undefined;
    let last: { action: Action; origin: Origin; at: number } | undefined;
    const run = (action: Action, origin: Origin) => {
      if (document.documentElement.dataset.flushing) return;
      const element = document.activeElement;
      const view =
        element instanceof HTMLElement && element.closest('.cm-content')
          ? EditorView.findFromDOM(element)
          : null;
      const editable =
        element instanceof HTMLElement &&
        (element.isContentEditable || element.matches('input, textarea'));
      if (!view && !editable) return;
      const at = performance.now();
      if (last?.action === action && last.origin !== origin && at - last.at < 250) {
        last = undefined;
        return;
      }
      last = { action, origin, at };
      if (view) {
        if (!view.state.readOnly && !view.composing)
          (action === 'history-undo' ? undo : redo)(view);
      } else {
        document.execCommand(action === 'history-undo' ? 'undo' : 'redo');
      }
    };
    const keyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.isComposing ||
        !event.metaKey ||
        event.altKey ||
        event.ctrlKey ||
        event.key.toLowerCase() !== 'z'
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      run(event.shiftKey ? 'history-redo' : 'history-undo', 'keyboard');
    };
    window.addEventListener('keydown', keyDown, true);
    void import('@tauri-apps/api/event')
      .then(({ listen }) =>
        listen<Action>('native-edit-history', (event) => run(event.payload, 'menu')),
      )
      .then((unlisten) => {
        if (disposed) unlisten();
        else stop = unlisten;
      })
      .catch(() => {}); // CodeMirror's keyboard path still works without the menu subscription.
    return () => {
      disposed = true;
      stop?.();
      window.removeEventListener('keydown', keyDown, true);
    };
  }, []);
  return null;
}
