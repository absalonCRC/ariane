import { useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { t } from '../i18n';

type Side = 'left' | 'right';
type Match = { row: number; start: number };

function selectionIn(root: HTMLElement, selection: Selection | null) {
  if (!selection?.rangeCount) return null;
  const range = selection.getRangeAt(0);
  const node = range.commonAncestorContainer;
  const element = node instanceof Element ? node : node.parentElement;
  const cell = element?.closest<HTMLElement>('[data-diff-side]');
  const quote = range.toString().trim();
  return cell && root.contains(cell) && quote
    ? { quote, side: cell.dataset.diffSide as Side }
    : null;
}

function uniqueMatch(root: HTMLElement, side: Side, quote: string): Match | null {
  let found: Match | null = null;
  for (const prose of root.querySelectorAll<HTMLElement>(`[data-diff-side="${side}"]`)) {
    const text = prose.textContent ?? '';
    const start = text.indexOf(quote);
    if (start < 0) continue;
    if (found || text.indexOf(quote, start + 1) >= 0) return null;
    found = { row: Number(prose.dataset.diffRow), start };
  }
  return found;
}

function rangeFor(prose: HTMLElement, start: number, length: number): Range | null {
  const doc = prose.ownerDocument;
  const walker = doc.createTreeWalker(prose, NodeFilter.SHOW_TEXT);
  const range = doc.createRange();
  let offset = 0;
  let started = false;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const end = offset + (node.textContent?.length ?? 0);
    if (!started && start < end) {
      range.setStart(node, start - offset);
      started = true;
    }
    if (started && start + length <= end) {
      range.setEnd(node, start + length - offset);
      return range;
    }
    offset = end;
  }
  return null;
}

export function usePhraseAlignment(
  ref: RefObject<HTMLDivElement | null>,
  context: object,
  enabled: boolean,
) {
  const lastSelection = useRef<ReturnType<typeof selectionIn>>(null);
  const [target, setTarget] = useState<{
    context: object;
    left: Match;
    right: Match;
    quote: string;
    side: Side;
  } | null>(null);
  const [notice, setNotice] = useState<{ context: object; text: string } | null>(null);
  const active = enabled && target?.context === context ? target : null;
  useLayoutEffect(() => {
    lastSelection.current = null;
    if (!enabled) return;
    const root = ref.current;
    if (!root) return;
    const doc = root.ownerDocument;
    const remember = () => {
      const selection = doc.getSelection();
      const current = selectionIn(root, selection);
      if (current || (selection?.anchorNode && root.contains(selection.anchorNode)))
        lastSelection.current = current;
    };
    doc.addEventListener('selectionchange', remember);
    return () => doc.removeEventListener('selectionchange', remember);
  }, [ref, context, enabled]);

  const align = () => {
    const root = ref.current;
    if (!root || !enabled) return;
    const selection = selectionIn(root, root.ownerDocument.getSelection()) ?? lastSelection.current;
    if (!selection) {
      setNotice({ context, text: t('Sélectionnez une phrase dans la comparaison.') });
      return;
    }
    const left = uniqueMatch(root, 'left', selection.quote);
    const right = uniqueMatch(root, 'right', selection.quote);
    if (!left || !right) {
      setNotice({
        context,
        text: t('La phrase doit apparaître une seule fois dans chaque version.'),
      });
      return;
    }
    setNotice(null);
    setTarget({ context, left, right, ...selection });
  };

  useLayoutEffect(() => {
    if (!active || !ref.current) return;
    const root = ref.current;
    const prose = (side: Side, match: Match) =>
      root.querySelector<HTMLElement>(`[data-diff-side="${side}"][data-diff-row="${match.row}"]`);
    const left = prose('left', active.left);
    const right = prose('right', active.right);
    if (!left || !right) return;
    const restoreSelection = root.ownerDocument.activeElement === root;
    const clear = () => {
      left.style.removeProperty('--diff-alignment');
      right.style.removeProperty('--diff-alignment');
    };
    let frame = 0;
    let first = true;
    let width = root.clientWidth;
    const measure = () => {
      clear();
      const l = rangeFor(left, active.left.start, active.quote.length);
      const r = rangeFor(right, active.right.start, active.quote.length);
      const a = l?.getClientRects()[0];
      const b = r?.getClientRects()[0];
      if (!a || !b) return;
      const delta = a.top - b.top;
      if (Math.abs(delta) > 0.25)
        (delta > 0 ? right : left).style.setProperty('--diff-alignment', `${Math.abs(delta)}px`);
      if (first) {
        const top = Math.max(a.top, b.top);
        const viewport = root.getBoundingClientRect();
        if (top < viewport.top || top + Math.max(a.height, b.height) > viewport.bottom)
          root.scrollTop += top - viewport.top - root.clientHeight / 3;
        if (restoreSelection) {
          const selection = root.ownerDocument.getSelection();
          const range = active.side === 'left' ? l : r;
          if (range && !selection?.rangeCount) selection?.addRange(range);
        }
        first = false;
      }
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(measure);
      });
    };
    schedule();
    const observer =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(() => {
            if (root.clientWidth !== width) {
              width = root.clientWidth;
              schedule();
            }
          });
    observer?.observe(root);
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      clear();
    };
  }, [ref, active]);

  const group =
    active && active.left.row !== active.right.row
      ? {
          start: Math.min(active.left.row, active.right.row),
          end: Math.max(active.left.row, active.right.row),
        }
      : null;
  return {
    align,
    group,
    alignedRow: active && active.left.row === active.right.row ? active.left.row : undefined,
    notice: notice?.context === context ? notice.text : '',
  };
}
