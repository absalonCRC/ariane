import { EditorView } from '@codemirror/view';
import { undo, redo, undoDepth, redoDepth, isolateHistory } from '@codemirror/commands';
import {
  Bold,
  Italic,
  Copy,
  Scissors,
  Clipboard,
  Search,
  Undo2,
  Redo2,
  IndentIncrease,
  IndentDecrease,
  ChevronUp,
  ChevronDown,
} from 'lucide-react';
import type { MenuAction, MenuContent } from '../components/ContextMenu';
import type { OutlineEditor } from './outline/state';
import type { Span } from './composite';
import { formatMarkdown, type MarkdownFormat } from './formatMarkdown';

export function editorContext(
  view: EditorView,
  outline: OutlineEditor,
  spans: Span[],
  current: () => EditorView | null,
  onSearch?: (text: string) => void,
): MenuContent {
  const state = view.state,
    selection = state.selection.main;
  const text = state.sliceDoc(selection.from, selection.to);
  const valid = () => current() === view && view.state.doc === state.doc;
  const perform = (action: () => unknown) => {
    if (valid()) {
      action();
      view.focus();
    }
  };
  const editable = !state.readOnly;
  const canCopy = typeof navigator.clipboard?.writeText === 'function';
  const canPaste = editable && typeof navigator.clipboard?.readText === 'function';
  const clipboard: MenuAction[] = [];
  if (text && canCopy) {
    if (editable)
      clipboard.push({
        label: 'Couper',
        icon: Scissors,
        shortcut: '⌘ X',
        run: async () => {
          await navigator.clipboard.writeText(text);
          perform(() =>
            view.dispatch({
              changes: { from: selection.from, to: selection.to },
              selection: { anchor: selection.from },
              userEvent: 'delete.cut',
            }),
          );
        },
      });
    clipboard.push({
      label: 'Copier',
      icon: Copy,
      shortcut: '⌘ C',
      run: () => navigator.clipboard.writeText(text),
    });
  }
  if (canPaste)
    clipboard.push({
      label: 'Coller',
      icon: Clipboard,
      shortcut: '⌘ V',
      run: async () => {
        const value = await navigator.clipboard.readText();
        if (value)
          perform(() =>
            view.dispatch({
              changes: { from: selection.from, to: selection.to, insert: value },
              selection: { anchor: selection.from + value.length },
              userEvent: 'input.paste',
            }),
          );
      },
    });
  const history: MenuAction[] = [];
  if (editable && undoDepth(state))
    history.push({
      label: 'Annuler',
      icon: Undo2,
      shortcut: '⌘ Z',
      run: () => perform(() => undo(view)),
    });
  if (editable && redoDepth(state))
    history.push({
      label: 'Rétablir',
      icon: Redo2,
      shortcut: '⌘ ⇧ Z',
      run: () => perform(() => redo(view)),
    });
  const selectionActions: MenuAction[] = [];
  const withinScene = spans.some((span) => selection.from >= span.from && selection.to <= span.to);
  const format = (kind: MarkdownFormat) =>
    perform(() =>
      view.dispatch({
        ...formatMarkdown(state, kind, spans),
        annotations: isolateHistory.of('full'),
      }),
    );
  if (text && editable && withinScene)
    selectionActions.push(
      { label: 'Gras', icon: Bold, run: () => format('bold') },
      { label: 'Italique', icon: Italic, run: () => format('italic') },
    );
  if (text.trim() && text.length <= 500 && onSearch)
    selectionActions.push({
      label: 'Rechercher dans les sources',
      icon: Search,
      run: () => onSearch(text),
    });
  const structure: MenuAction[] = [];
  if (selection.empty && editable) {
    const session = state.field(outline.field);
    const span = spans.find((span) => selection.head >= span.from && selection.head <= span.to);
    const nodes = session.nodes.filter((node) => node.section === span?.id);
    const node = [...nodes].reverse().find((node) => node.from <= selection.head);
    if (node) {
      const siblings = nodes.filter((item) => item.parent === node.parent),
        index = siblings.indexOf(node);
      if (index > 0)
        structure.push({
          label: 'Indenter le passage',
          icon: IndentIncrease,
          shortcut: 'Tab',
          run: () => perform(() => outline.indent(view)),
        });
      if (node.parent)
        structure.push({
          label: 'Désindenter le passage',
          icon: IndentDecrease,
          shortcut: '⇧ Tab',
          run: () => perform(() => outline.outdent(view)),
        });
      if (index > 0)
        structure.push({
          label: 'Monter le passage',
          icon: ChevronUp,
          shortcut: '⌥ ↑',
          run: () => perform(() => outline.move(view, -1)),
        });
      if (index >= 0 && index < siblings.length - 1)
        structure.push({
          label: 'Descendre le passage',
          icon: ChevronDown,
          shortcut: '⌥ ↓',
          run: () => perform(() => outline.move(view, 1)),
        });
      if (nodes.some((item) => item.parent === node.id))
        structure.push({
          label: session.folded.has(node.id)
            ? 'Déplier les sous-passages'
            : 'Replier les sous-passages',
          run: () => perform(() => outline.toggleFold(view, node.id)),
        });
    }
  }
  const words = text.trim() ? text.trim().split(/\s+/u).length : 0;
  return {
    title: text ? 'Sélection' : 'Passage',
    detail: text
      ? `${words} mot${words > 1 ? 's' : ''} sélectionné${words > 1 ? 's' : ''}`
      : undefined,
    groups: [history, clipboard, selectionActions, structure],
  };
}
