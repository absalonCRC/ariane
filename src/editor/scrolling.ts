import type { EditorView } from '@codemirror/view';

// The title and editor share this viewport; standalone editors keep their own scroller.
export function documentScroller(view: EditorView): HTMLElement {
  return view.dom.closest<HTMLElement>('.manuscript-column') ?? view.scrollDOM;
}

export function documentBounds(view: EditorView) {
  const viewport = documentScroller(view).getBoundingClientRect();
  const editor = view.scrollDOM.getBoundingClientRect();
  return {
    top: viewport.top,
    bottom: viewport.bottom,
    left: editor.left,
    right: editor.right,
    width: editor.width,
  };
}
