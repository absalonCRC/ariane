import type { EditorView } from '@codemirror/view';
import type { TypewriterStroke } from './typewriterSound';
export function typewriterStroke(
  event: KeyboardEvent,
  view: EditorView,
  readOnly = false,
): TypewriterStroke | null {
  const target = event.target;
  if (
    readOnly ||
    !(target instanceof HTMLElement) ||
    !view.contentDOM.contains(target) ||
    event.metaKey ||
    (event.ctrlKey && !event.getModifierState('AltGraph')) ||
    event.isComposing
  )
    return null;
  const table = target.closest('.markdown-table-preview');
  const tableInput = table && target instanceof HTMLInputElement && !target.readOnly;
  if (
    table ? !tableInput : !!target.closest('button,input,textarea,select,[contenteditable="false"]')
  )
    return null;
  if (event.key === 'Enter') return tableInput ? null : 'return';
  if (event.key === 'Backspace' || event.key === 'Delete') return 'delete';
  if (event.key === ' ') return 'space';
  return Array.from(event.key).length === 1 ? 'key' : null;
}
