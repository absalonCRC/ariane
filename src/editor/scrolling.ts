import type { EditorView } from '@codemirror/view';

export const MANUSCRIPT_CHROME_INSET = 55;

// The title and editor share this viewport; standalone editors keep their own scroller.
export function documentScroller(view: EditorView): HTMLElement {
  return view.dom.closest<HTMLElement>('.manuscript-column') ?? view.scrollDOM;
}

// The manuscript can scroll under the blurred chrome, while anchored controls
// stay within the unobscured writing area.
export function manuscriptVisibleBounds(scroller: HTMLElement) {
  const viewport = scroller.getBoundingClientRect();
  if (!scroller.classList.contains('manuscript-column')) return viewport;
  const height = scroller.ownerDocument.defaultView?.innerHeight ?? viewport.bottom;
  const top = Math.max(viewport.top, MANUSCRIPT_CHROME_INSET);
  return { top, bottom: Math.max(top, Math.min(viewport.bottom, height - MANUSCRIPT_CHROME_INSET)) };
}

export function documentBounds(view: EditorView) {
  const viewport = manuscriptVisibleBounds(documentScroller(view));
  const editor = view.scrollDOM.getBoundingClientRect();
  return {
    top: viewport.top,
    bottom: viewport.bottom,
    left: editor.left,
    right: editor.right,
    width: editor.width,
  };
}
