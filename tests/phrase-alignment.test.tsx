// @vitest-environment jsdom
import { act, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { ComparisonRows } from '../src/history/ComparisonRows';
import { comparePassages } from '../src/history/comparison';
import { usePhraseAlignment } from '../src/history/usePhraseAlignment';

it('mesure les deux occurrences uniques sans bouger pour une phrase dupliquée ou absente', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = document.createElement('div');
  document.body.append(host);
  const react = createRoot(host);
  const pending = new Map<number, FrameRequestCallback>();
  let frameId = 0;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    pending.set(++frameId, callback);
    return frameId;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => pending.delete(id));
  const originalRects = Object.getOwnPropertyDescriptor(Range.prototype, 'getClientRects');
  Object.defineProperty(Range.prototype, 'getClientRects', {
    configurable: true,
    value(this: Range) {
      const cell = this.startContainer.parentElement?.closest<HTMLElement>('.diff-prose');
      const top =
        (cell?.dataset.diffSide === 'left' ? 25 : 65) +
        (parseFloat(cell?.style.getPropertyValue('--diff-alignment') || '') || 0);
      return [new DOMRect(0, top, 100, 20)];
    },
  });
  const compare = {};
  const rows = comparePassages(
    'Seul à gauche. Pas ici. Pas ici. La fin est commune.',
    'Suite plus longue. Pas ici. Pas ici. La fin est commune.',
  );
  function Harness() {
    const ref = useRef<HTMLDivElement>(null);
    const alignment = usePhraseAlignment(ref, compare, true);
    return (
      <>
        <button onClick={alignment.align}>Aligner ici</button>
        <span role="status">{alignment.notice}</span>
        <div className="history-diff-scroll" ref={ref}>
          <ComparisonRows
            rows={rows}
            reading={false}
            currentChange={undefined}
            canApply={false}
            busy={false}
            apply={async () => {}}
            group={alignment.group}
          />
        </div>
      </>
    );
  }
  function pick(quote: string) {
    const cell = host.querySelector('[data-diff-side="left"]')!;
    const start = cell.textContent!.indexOf(quote);
    if (start < 0) throw new Error('Témoin introuvable');
    const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    let offset = 0;
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const end = offset + node.textContent!.length;
      if (start >= offset && start < end) range.setStart(node, start - offset);
      if (start + quote.length > offset && start + quote.length <= end) {
        range.setEnd(node, start + quote.length - offset);
        break;
      }
      offset = end;
    }
    document.getSelection()!.removeAllRanges();
    document.getSelection()!.addRange(range);
  }
  try {
    await act(async () => react.render(<Harness />));
    const align = host.querySelector('button')!;
    const root = host.querySelector<HTMLDivElement>('.history-diff-scroll')!;
    const left = root.querySelector<HTMLElement>('[data-diff-side="left"]')!;
    vi.spyOn(root, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 100, 200));
    pick('La fin est commune.');
    await act(async () => align.click());
    while (pending.size) {
      const calls = [...pending.values()];
      pending.clear();
      for (const callback of calls) callback(0);
    }
    expect(left.style.getPropertyValue('--diff-alignment')).toBe('40px');
    root.scrollTop = 24;
    for (const quote of ['Pas ici.', 'Seul à gauche']) {
      pick(quote);
      await act(async () => align.click());
      expect(host.querySelector('[role="status"]')?.textContent).toContain('une seule fois');
      expect(left.style.getPropertyValue('--diff-alignment')).toBe('40px');
      expect(root.scrollTop).toBe(24);
    }
  } finally {
    await act(async () => react.unmount());
    host.remove();
    if (originalRects) Object.defineProperty(Range.prototype, 'getClientRects', originalRects);
    else delete (Range.prototype as Partial<Range>).getClientRects;
    vi.unstubAllGlobals();
  }
});
