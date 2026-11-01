import { useLayoutEffect, type RefObject } from 'react';

const TOP = 44;
const BOTTOM = 55;
const GAP = 12;

// Preserve a readable middle slot; short windows let the two menus scroll instead.
export function resumePanelLimits(viewportHeight: number, upper: number, lower: number) {
  const available = Math.max(0, viewportHeight - TOP - BOTTOM);
  const minimum = Math.min(160, Math.max(96, available * 0.28), available);
  const gaps = (Number(upper > 0) + Number(lower > 0)) * GAP;
  const budget = Math.max(0, available - minimum - gaps);
  const lowerMinimum = upper && lower ? Math.min(160, budget * 0.55) : 0;
  const upperLimit = Math.min(upper, Math.max(0, budget - lowerMinimum));
  return { upper: upperLimit, lower: Math.min(lower, Math.max(0, budget - upperLimit)) };
}

export function useResumeLayout(
  ref: RefObject<HTMLElement | null>,
  active: boolean,
  projectMenuOpen: boolean,
  writingMenuOpen: boolean,
) {
  useLayoutEffect(() => {
    const panel = ref.current;
    if (!active || !panel) return;
    const upper = document.getElementById('project-menu');
    const lower = document.getElementById('writing-settings');
    const limit = '--resume-height-limit';
    const update = () => {
      const heights = resumePanelLimits(
        innerHeight,
        projectMenuOpen && upper ? upper.scrollHeight : 0,
        writingMenuOpen && lower ? lower.scrollHeight : 0,
      );
      if (projectMenuOpen) upper?.style.setProperty(limit, `${heights.upper}px`);
      else upper?.style.removeProperty(limit);
      if (writingMenuOpen) lower?.style.setProperty(limit, `${heights.lower}px`);
      else lower?.style.removeProperty(limit);
      panel.style.top = `${TOP + (projectMenuOpen && upper ? upper.offsetHeight + GAP : 0)}px`;
      panel.style.bottom = `${BOTTOM + (writingMenuOpen && lower ? lower.offsetHeight + GAP : 0)}px`;
    };
    update();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    if (upper) observer?.observe(upper);
    if (lower) observer?.observe(lower);
    window.addEventListener('resize', update);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', update);
      upper?.style.removeProperty(limit);
      lower?.style.removeProperty(limit);
      panel.style.removeProperty('top');
      panel.style.removeProperty('bottom');
    };
  }, [active, projectMenuOpen, writingMenuOpen, ref]);
}
