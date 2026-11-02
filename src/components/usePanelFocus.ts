import { useLayoutEffect, type RefObject } from 'react';

/** Return keyboard focus only if it still belongs to the closing panel. */
export function usePanelFocus(ref: RefObject<HTMLElement | null>, open: boolean, autoFocus = true) {
  useLayoutEffect(() => {
    const panel = ref.current;
    if (!open || !panel) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (autoFocus)
      panel
        .querySelector<HTMLElement>('button, input, [tabindex="0"]')
        ?.focus({ preventScroll: true });
    return () => {
      queueMicrotask(() => {
        if (!panel.contains(document.activeElement) && document.activeElement !== document.body)
          return;
        const destination =
          previous?.isConnected && !previous.closest('[inert]') && previous !== document.body
            ? previous
            : document.querySelector<HTMLElement>('.cm-content');
        destination?.focus({ preventScroll: true });
      });
    };
  }, [ref, open, autoFocus]);
}
