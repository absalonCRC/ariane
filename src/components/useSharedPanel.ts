import { usePanelFocus } from './usePanelFocus';
import { useEffect, useLayoutEffect, useRef } from 'react';
import { manuscriptVisibleBounds } from '../editor/scrolling';

export interface PanelOrigin {
  left: number;
  top: number;
  width: number;
  height: number;
  label?: string;
  anchor?: HTMLElement;
  scroller?: HTMLElement;
  scrollTop?: number;
  rightInset?: number;
}

export function panelOrigin(element: HTMLElement, label: string): PanelOrigin {
  const { left, top, width, height } = element.getBoundingClientRect();
  const scroller = document.querySelector<HTMLElement>('.manuscript-column') ?? undefined;
  return {
    left,
    top,
    width,
    height,
    label,
    anchor: element,
    scroller,
    scrollTop: scroller?.scrollTop ?? window.scrollY,
    rightInset: innerWidth - left - width,
  };
}

// The expanded suggestion stays attached to its passage as the document scrolls.
export function useSharedPanel(
  origin: PanelOrigin | null | undefined,
  identity: string | null,
  onClose: () => void,
) {
  const ref = useRef<HTMLElement>(null);
  usePanelFocus(ref, !!identity, false);
  const close = useRef(onClose);
  close.current = onClose;
  useLayoutEffect(() => {
    const element = ref.current;
    if (!identity || !element) return;
    const writing = document.getElementById('writing-settings');
    const scroller = origin?.scroller ?? document.querySelector<HTMLElement>('.manuscript-column');
    const scrollTop = () => scroller?.scrollTop ?? window.scrollY;
    let contentTop = (origin?.top ?? 160) + (origin?.scrollTop ?? scrollTop());
    let rightInset = origin?.rightInset ?? (origin ? innerWidth - origin.left - origin.width : 25);
    const animations: Animation[] = [];
    const clip = (top: number, height: number) => {
      const viewport = scroller ? manuscriptVisibleBounds(scroller) : undefined;
      return `inset(${Math.max(0, (viewport?.top ?? 0) - top)}px 0 ${Math.max(0, top + height - (viewport?.bottom ?? innerHeight))}px 0)`;
    };
    const position = () => {
      const height = Math.min(writing?.offsetHeight || 400, innerHeight - 110);
      const width = Math.min(writing?.offsetWidth || 310, Math.max(0, innerWidth - 48));
      const top = contentTop - scrollTop();
      element.style.height = `${height}px`;
      element.style.width = `${width}px`;
      element.style.left = `${Math.max(8, innerWidth - rightInset - width)}px`;
      element.style.top = `${top}px`;
      element.style.clipPath = clip(top, height);
    };
    const scrolled = () => {
      animations.splice(0).forEach((animation) => animation.cancel());
      delete element.dataset.morphing;
      position();
    };
    const reanchor = () => {
      if (origin?.anchor?.isConnected) {
        const rect = origin.anchor.getBoundingClientRect();
        contentTop = rect.top + scrollTop();
        rightInset = innerWidth - rect.right;
      }
      position();
    };
    position();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(position);
    if (writing) observer?.observe(writing);
    const anchorObserver =
      typeof MutationObserver === 'undefined' ? null : new MutationObserver(reanchor);
    const rail = origin?.anchor?.closest('.source-margin, .vault-search-margin');
    rail?.addEventListener('scroll', reanchor, { passive: true });
    if (rail)
      anchorObserver?.observe(rail, {
        subtree: true,
        attributes: true,
        attributeFilter: ['style'],
      });
    window.addEventListener('resize', reanchor);
    scroller?.addEventListener('scroll', scrolled, { passive: true });
    window.addEventListener('scroll', scrolled, { passive: true });
    const wheel = (event: WheelEvent) => {
      if (!scroller || !event.deltaY) return;
      let target = event.target instanceof HTMLElement ? event.target : null;
      while (target && element.contains(target)) {
        if (
          target.scrollHeight > target.clientHeight &&
          ['auto', 'scroll'].includes(getComputedStyle(target).overflowY) &&
          (event.deltaY < 0
            ? target.scrollTop > 0
            : target.scrollTop + target.clientHeight < target.scrollHeight - 1)
        )
          return;
        if (target === element) break;
        target = target.parentElement;
      }
      event.preventDefault();
      scroller.scrollTop +=
        event.deltaY *
        (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? scroller.clientHeight : 1);
      scrolled();
    };
    element.addEventListener('wheel', wheel, { passive: false });
    const focus = () =>
      !element.closest('[data-phase="exit"]') &&
      element.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
    const reduced =
      typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (
      origin &&
      origin.width > 0 &&
      origin.height > 0 &&
      !reduced &&
      typeof element.animate === 'function'
    ) {
      const destination = element.getBoundingClientRect();
      element.dataset.morphing = 'true';
      const surface = element.animate(
        [
          {
            left: `${origin.left}px`,
            top: `${origin.top}px`,
            width: `${origin.width}px`,
            height: `${origin.height}px`,
            borderRadius: '2px',
            background: 'var(--shared-panel-background, var(--theme-paper, #fafafa))',
            clipPath: clip(origin.top, origin.height),
          },
          {
            left: `${destination.left}px`,
            top: `${destination.top}px`,
            width: `${destination.width}px`,
            height: `${destination.height}px`,
            borderRadius: '18px',
            background: 'var(--shared-panel-background, var(--theme-hover, #f2f2f2))',
            clipPath: element.style.clipPath,
          },
        ],
        { duration: 320, easing: 'cubic-bezier(0.22, 0.75, 0.2, 1)' },
      );
      animations.push(surface);
      for (const child of element.children) {
        const label = child.classList.contains('shared-panel-label');
        animations.push(
          child.animate(
            label ? [{ opacity: 1 }, { opacity: 0 }] : [{ opacity: 0 }, { opacity: 1 }],
            label
              ? { duration: 140, fill: 'forwards' }
              : { delay: 100, duration: 220, fill: 'backwards' },
          ),
        );
      }
      void surface.finished
        .then(() => {
          delete element.dataset.morphing;
          focus();
        })
        .catch(() => {});
    } else focus();
    return () => {
      observer?.disconnect();
      anchorObserver?.disconnect();
      rail?.removeEventListener('scroll', reanchor);
      window.removeEventListener('resize', reanchor);
      window.removeEventListener('scroll', scrolled);
      scroller?.removeEventListener('scroll', scrolled);
      element.removeEventListener('wheel', wheel);
      animations.forEach((animation) => animation.cancel());
      delete element.dataset.morphing;
    };
  }, [origin, identity]);
  useEffect(() => {
    if (!identity) return;
    const escape = (event: KeyboardEvent) => {
      if (
        event.key !== 'Escape' ||
        event.defaultPrevented ||
        ref.current?.closest('[data-phase="exit"]')
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      close.current();
    };
    window.addEventListener('keydown', escape, true);
    return () => window.removeEventListener('keydown', escape, true);
  }, [identity]);
  return ref;
}
