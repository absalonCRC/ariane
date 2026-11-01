import type { PointerEvent } from 'react';

export function trackSidebarPointer(event: PointerEvent<HTMLButtonElement>) {
  const target = event.currentTarget;
  const bounds = target.getBoundingClientRect();
  const y = Math.max(12, Math.min(bounds.height - 12, event.clientY - bounds.top));
  target.style.setProperty('--sidebar-chevron-y', `${y}px`);
}
