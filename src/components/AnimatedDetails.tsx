import { useLayoutEffect, useRef, type ReactNode } from 'react';

export function AnimatedDetails({
  summary,
  children,
  open = false,
  className = '',
}: {
  summary: ReactNode;
  children: ReactNode;
  open?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  const initialOpen = useRef(open);
  useLayoutEffect(() => {
    const element = ref.current!;
    const summaryElement = element.querySelector('summary')!;
    const content = element.querySelector<HTMLElement>('.details-content')!;
    let expanded = open,
      animation: Animation | undefined;
    const media =
      typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
    const settle = () => {
      if (!media?.matches) return;
      animation?.cancel();
      animation = undefined;
      element.open = expanded;
      element.style.removeProperty('overflow');
    };
    media?.addEventListener?.('change', settle);
    element.open = expanded;
    summaryElement.setAttribute('aria-expanded', String(expanded));
    content.inert = !expanded;
    const toggle = (event: MouseEvent) => {
      event.preventDefault();
      const from = element.getBoundingClientRect().height;
      animation?.cancel();
      expanded = !expanded;
      summaryElement.setAttribute('aria-expanded', String(expanded));
      content.inert = !expanded;
      const reduced = media?.matches;
      if (reduced || typeof element.animate !== 'function') {
        element.open = expanded;
        return;
      }
      element.open = true;
      const to = expanded
        ? element.getBoundingClientRect().height
        : summaryElement.getBoundingClientRect().height;
      element.style.overflow = 'hidden';
      const current = element.animate([{ height: `${from}px` }, { height: `${to}px` }], {
        duration: expanded ? 200 : 160,
        easing: 'cubic-bezier(0.22, 0.75, 0.2, 1)',
      });
      animation = current;
      void current.finished
        .then(() => {
          if (animation !== current) return;
          element.open = expanded;
          element.style.removeProperty('overflow');
        })
        .catch(() => {});
    };
    summaryElement.addEventListener('click', toggle);
    return () => {
      summaryElement.removeEventListener('click', toggle);
      media?.removeEventListener?.('change', settle);
      animation?.cancel();
      element.style.removeProperty('overflow');
    };
  }, [open]);
  return (
    <details ref={ref} open={initialOpen.current} className={`animated-details ${className}`}>
      <summary>{summary}</summary>
      <div className="details-content">{children}</div>
    </details>
  );
}
