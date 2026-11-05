import { useLayoutEffect } from 'react';

const controls = [
  '.path-heading',
  '.menu-control',
  '.voice-control',
  '.focus-mode-trigger',
  '.resume-trigger',
  '.header-search',
  '.writing-counter',
  '.depth-control',
  '.settings-control',
  '.goal-status',
  '.binder-footer-actions',
].join(', ');

const scopes = [
  {
    root: '.manuscript-column:not([hidden])',
    content:
      '.document-title, .cm-line, .scene-heading, .working-text-label, .empty-manuscript p, .empty-manuscript button, .add-first-scene, .cm-content img, .cm-content svg, .cm-content canvas, .cm-content table',
  },
  { root: '.source-margin', content: '.source-label, .more-sources' },
  {
    root: '.history-editor',
    content:
      '.history-modebar, .history-controls, .history-diff-summary, .history-diff-row, .history-metadata, .history-first-version',
  },
];

type Box = Pick<DOMRect, 'left' | 'right' | 'top' | 'bottom'>;

function overlaps(a: Box, b: Box, clip: Box) {
  return (
    Math.max(a.left, b.left, clip.left) < Math.min(a.right, b.right, clip.right) &&
    Math.max(a.top, b.top, clip.top) < Math.min(a.bottom, b.bottom, clip.bottom)
  );
}

function titleBox(input: HTMLInputElement, box: DOMRect): Box | null {
  const text = input.value || input.placeholder;
  if (!text.trim()) return null;
  const style = getComputedStyle(input);
  const context = document.createElement('canvas').getContext('2d');
  if (!context) return box;
  context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  const width = Math.min(box.width, context.measureText(text).width);
  const left = box.left + (parseFloat(style.paddingLeft) || 0);
  return { left, right: Math.min(box.right, left + width), top: box.top, bottom: box.bottom };
}

// Inspect rendered text fragments instead of whole line boxes, which often contain empty space.
export function updateChromeObstructions(root: HTMLElement) {
  const targets = [...root.querySelectorAll<HTMLElement>(controls)].map((element) => ({
    element,
    box: element.getBoundingClientRect(),
    covered: false,
  }));
  for (const scope of scopes) {
    const container = root.querySelector<HTMLElement>(scope.root);
    if (!container) continue;
    const viewport = container.getBoundingClientRect();
    if (viewport.width <= 0 || viewport.height <= 0) continue;
    for (const element of container.querySelectorAll<HTMLElement>(scope.content)) {
      const box = element.getBoundingClientRect();
      const clip =
        element.closest<HTMLElement>('.history-diff-scroll')?.getBoundingClientRect() ?? viewport;
      const candidates = targets.filter(
        (target) => !target.covered && overlaps(target.box, box, clip),
      );
      if (!candidates.length) continue;
      const style = getComputedStyle(element);
      if (style.visibility === 'hidden' || style.display === 'none' || style.opacity === '0')
        continue;
      let fragments: Box[];
      if (element instanceof HTMLInputElement) {
        const title = titleBox(element, box);
        fragments = title ? [title] : [];
      } else if (element.matches('img, svg, canvas, table')) {
        fragments = [box];
      } else if (element.textContent?.trim()) {
        const range = document.createRange();
        range.selectNodeContents(element);
        fragments = Array.from(range.getClientRects());
      } else fragments = [];
      for (const target of candidates) {
        if (fragments.some((fragment) => overlaps(target.box, fragment, clip)))
          target.covered = true;
      }
    }
  }
  for (const { element, covered } of targets)
    element.toggleAttribute('data-content-behind', covered);
}

export function useChromeObstructions(
  root: HTMLElement | null,
  sidebarOpen: boolean,
  history: boolean,
) {
  useLayoutEffect(() => {
    if (!root) return;
    let active = true;
    let frame = 0;
    let manuscriptMoving = false;
    let settle: ReturnType<typeof setTimeout> | undefined;
    const observed = new WeakSet<Element>();
    const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule);
    function measure() {
      frame = 0;
      updateChromeObstructions(root!);
      const observedSelectors = `${controls}, ${scopes.map((scope) => scope.root).join(', ')}`;
      for (const element of root!.querySelectorAll(observedSelectors)) {
        if (!observed.has(element)) {
          observed.add(element);
          resize?.observe(element);
        }
      }
    }
    function schedule() {
      if (active && !manuscriptMoving && !frame) frame = requestAnimationFrame(measure);
    }
    function endScroll() {
      clearTimeout(settle);
      manuscriptMoving = false;
      schedule();
    }
    function onScroll(event: Event) {
      if (!(event.target instanceof HTMLElement) || !event.target.matches('.manuscript-column')) {
        schedule();
        return;
      }
      manuscriptMoving = true;
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      clearTimeout(settle);
      settle = setTimeout(endScroll, 120);
    }
    function onScrollEnd(event: Event) {
      if (event.target instanceof HTMLElement && event.target.matches('.manuscript-column'))
        endScroll();
    }
    const mutations = new MutationObserver(schedule);
    mutations.observe(root, { childList: true, characterData: true, subtree: true });
    resize?.observe(root);
    root.addEventListener('scroll', onScroll, true);
    root.addEventListener('scrollend', onScrollEnd, true);
    root.addEventListener('input', schedule, true);
    root.addEventListener('transitionend', schedule, true);
    window.addEventListener('resize', schedule);
    void document.fonts?.ready.then(schedule);
    schedule();
    return () => {
      active = false;
      if (frame) cancelAnimationFrame(frame);
      clearTimeout(settle);
      mutations.disconnect();
      resize?.disconnect();
      root.removeEventListener('scroll', onScroll, true);
      root.removeEventListener('scrollend', onScrollEnd, true);
      root.removeEventListener('input', schedule, true);
      root.removeEventListener('transitionend', schedule, true);
      window.removeEventListener('resize', schedule);
      root
        .querySelectorAll('[data-content-behind]')
        .forEach((element) => element.removeAttribute('data-content-behind'));
    };
  }, [root, sidebarOpen, history]);
}
