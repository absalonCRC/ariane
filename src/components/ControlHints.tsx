import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

type Hint = {
  anchor: HTMLElement;
  text: string;
  host: HTMLElement;
  modal: HTMLDialogElement | null;
  pointerY?: number;
};

function menuIsOpen(element: HTMLElement): boolean {
  return (
    element.getAttribute('aria-expanded') === 'true' &&
    !element.hasAttribute('data-hint-while-expanded') &&
    (element.hasAttribute('aria-controls') || element.hasAttribute('aria-haspopup'))
  );
}

// Explicit hints can add context; otherwise use the accessible name of an icon-only control.
function hintTarget(node: EventTarget | null): { element: HTMLElement; text: string } | null {
  if (!(node instanceof Element)) return null;
  const element = node.closest<HTMLElement>(
    '[data-hint], [data-tooltip], button[aria-label], [role="button"][aria-label]',
  );
  if (!element || element.closest('[inert], [aria-hidden="true"]') || menuIsOpen(element))
    return null;
  const explicit = element.dataset.hint || element.dataset.tooltip;
  if (explicit) return { element, text: explicit };
  const visibleText = element.textContent?.trim() ?? '';
  if (/[\p{L}\p{N}]/u.test(visibleText)) return null;
  const label = element.getAttribute('title')?.trim() || element.getAttribute('aria-label')?.trim();
  return label ? { element, text: label } : null;
}

function modalParent(element: HTMLElement): HTMLDialogElement | null {
  const dialog = element.closest('dialog[open]');
  if (!(dialog instanceof HTMLDialogElement)) return null;
  try {
    return dialog.matches(':modal') ? dialog : null;
  } catch {
    return null;
  }
}

export function ControlHints() {
  const [hint, setHint] = useState<Hint | null>(null);
  const bubble = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = bubble.current;
    if (!element || !hint || !hint.anchor.isConnected) return;
    const anchor = hint.anchor.getBoundingClientRect();
    const modal = hint.modal?.getBoundingClientRect();
    const left = Math.max(8, modal ? modal.left + 8 : 8);
    const right = Math.min(innerWidth - 8, modal ? modal.right - 8 : innerWidth - 8);
    const top = Math.max(8, modal ? modal.top + 8 : 8);
    const bottom = Math.min(innerHeight - 8, modal ? modal.bottom - 8 : innerHeight - 8);
    const width = element.offsetWidth;
    const height = element.offsetHeight;
    if (hint.anchor.dataset.hintPlacement === 'sidebar-edge') {
      const anchorY =
        hint.pointerY === undefined || hint.anchor.matches(':focus-visible')
          ? anchor.top + anchor.height / 2
          : Math.max(anchor.top + 12, Math.min(anchor.bottom - 12, hint.pointerY));
      const roomRight = right - anchor.right;
      const roomLeft = anchor.left - left;
      const side = roomRight >= width + 6 || roomRight >= roomLeft ? 'right' : 'left';
      const desiredX = side === 'right' ? anchor.right + 6 : anchor.left - width - 6;
      const x = Math.max(left, Math.min(right - width, desiredX));
      const y = Math.max(top, Math.min(bottom - height, anchorY - height / 2));
      element.dataset.side = side;
      element.style.setProperty(
        '--hint-anchor-y',
        `${Math.max(10, Math.min(height - 10, anchorY - y))}px`,
      );
      element.style.left = `${hint.modal ? x - (modal?.left ?? 0) + hint.modal.scrollLeft : x}px`;
      element.style.top = `${hint.modal ? y - (modal?.top ?? 0) + hint.modal.scrollTop : y}px`;
      element.style.visibility = 'visible';
      return;
    }
    const x = Math.max(left, Math.min(right - width, anchor.left + anchor.width / 2 - width / 2));
    const above = anchor.top - height - 6 >= top;
    const y = Math.max(
      top,
      Math.min(bottom - height, above ? anchor.top - height - 6 : anchor.bottom + 6),
    );
    element.dataset.side = above ? 'above' : 'below';
    element.style.setProperty(
      '--hint-anchor',
      `${Math.max(12, Math.min(width - 12, anchor.left + anchor.width / 2 - x))}px`,
    );
    element.style.left = `${hint.modal ? x - (modal?.left ?? 0) + hint.modal.scrollLeft : x}px`;
    element.style.top = `${hint.modal ? y - (modal?.top ?? 0) + hint.modal.scrollTop : y}px`;
    element.style.visibility = 'visible';
  }, [hint]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let current: HTMLElement | null = null;
    let observer: MutationObserver | undefined;
    let pointerInput = false;
    let pointerY: number | undefined;
    let showing = false;
    let suppressed: { element: HTMLElement; title: string | null } | null = null;
    const restoreTitle = () => {
      if (suppressed && suppressed.element.getAttribute('title') === '') {
        if (suppressed.title === null) suppressed.element.removeAttribute('title');
        else suppressed.element.setAttribute('title', suppressed.title);
      }
      suppressed = null;
    };
    const hide = () => {
      clearTimeout(timer);
      observer?.disconnect();
      observer = undefined;
      restoreTitle();
      current = null;
      pointerY = undefined;
      showing = false;
      setHint(null);
    };
    const show = (target: { element: HTMLElement; text: string }, delay: number, y?: number) => {
      if (target.element === current) {
        pointerY = y;
        if (delay !== 0) return;
        clearTimeout(timer);
      } else {
        hide();
        current = target.element;
        pointerY = y;
        observer = new MutationObserver(() => {
          if (current && menuIsOpen(current)) hide();
        });
        observer.observe(target.element, { attributes: true, attributeFilter: ['aria-expanded'] });
        const title = target.element.getAttribute('title');
        if (title !== null || target.element.parentElement?.closest('[title]')) {
          suppressed = { element: target.element, title };
          target.element.setAttribute('title', '');
        }
      }
      timer = setTimeout(() => {
        if (
          !target.element.isConnected ||
          target.element.closest('[inert], [aria-hidden="true"]') ||
          menuIsOpen(target.element)
        )
          return hide();
        const modal = modalParent(target.element);
        showing = true;
        setHint({
          anchor: target.element,
          text: target.text,
          modal,
          host: modal ?? document.body,
          pointerY,
        });
      }, delay);
    };
    const over = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return;
      const target = hintTarget(event.target);
      if (target)
        show(
          target,
          350,
          target.element.dataset.hintPlacement === 'sidebar-edge' ? event.clientY : undefined,
        );
    };
    const move = (event: PointerEvent) => {
      if (
        event.pointerType === 'touch' ||
        !current ||
        current.dataset.hintPlacement !== 'sidebar-edge' ||
        !(event.target instanceof Node) ||
        !current.contains(event.target)
      )
        return;
      const anchor = current;
      const y = event.clientY;
      pointerY = y;
      if (showing)
        setHint((value) =>
          value?.anchor === anchor && value.pointerY !== y ? { ...value, pointerY: y } : value,
        );
    };
    const out = (event: PointerEvent) => {
      if (
        current &&
        !(event.relatedTarget instanceof Node && current.contains(event.relatedTarget)) &&
        !(current.contains(document.activeElement) && !pointerInput)
      )
        hide();
    };
    const focus = (event: FocusEvent) => {
      const target = hintTarget(event.target);
      if (target && !pointerInput) show(target, 0);
      else hide();
    };
    const key = (event: KeyboardEvent) => {
      pointerInput = false;
      if (['Escape', 'Enter', ' '].includes(event.key)) hide();
    };
    const down = () => {
      pointerInput = true;
      hide();
    };
    document.addEventListener('pointerover', over);
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerout', out);
    document.addEventListener('focusin', focus);
    document.addEventListener('focusout', hide);
    window.addEventListener('keydown', key, true);
    document.addEventListener('pointerdown', down, true);
    window.addEventListener('resize', hide);
    window.addEventListener('blur', hide);
    document.addEventListener('scroll', hide, true);
    return () => {
      clearTimeout(timer);
      observer?.disconnect();
      restoreTitle();
      document.removeEventListener('pointerover', over);
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerout', out);
      document.removeEventListener('focusin', focus);
      document.removeEventListener('focusout', hide);
      window.removeEventListener('keydown', key, true);
      document.removeEventListener('pointerdown', down, true);
      window.removeEventListener('resize', hide);
      window.removeEventListener('blur', hide);
      document.removeEventListener('scroll', hide, true);
    };
  }, []);

  return hint
    ? createPortal(
        <div
          ref={bubble}
          className="control-hint"
          role="tooltip"
          aria-hidden="true"
          style={{ position: hint.modal ? 'absolute' : 'fixed', visibility: 'hidden' }}
        >
          {hint.text}
        </div>,
        hint.host,
      )
    : null;
}
