// @vitest-environment jsdom
import { act, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it } from 'vitest';
import { resumePanelLimits, useResumeLayout } from '../src/enrichment/useResumeLayout';

it('reserves a readable middle slot and lets menus scroll in short windows', () => {
  for (const height of [600, 720, 1000]) {
    for (const [upper, lower] of [
      [178, 375],
      [178, 0],
      [0, 375],
      [0, 0],
    ]) {
      const limits = resumePanelLimits(height, upper, lower);
      const gaps = (Number(upper > 0) + Number(lower > 0)) * 12;
      const remaining = height - 44 - 55 - gaps - limits.upper - limits.lower;
      expect(remaining).toBeGreaterThanOrEqual(140);
      expect(limits.upper).toBeLessThanOrEqual(upper);
      expect(limits.lower).toBeLessThanOrEqual(lower);
    }
  }
  expect(resumePanelLimits(1000, 178, 375)).toEqual({ upper: 178, lower: 375 });
  expect(resumePanelLimits(600, 178, 375).lower).toBeLessThan(375);
});

const viewport = Object.getOwnPropertyDescriptor(window, 'innerHeight');
let host: HTMLDivElement | undefined;
let root: ReturnType<typeof createRoot> | undefined;
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  host?.remove();
  if (viewport) Object.defineProperty(window, 'innerHeight', viewport);
  root = undefined;
});

it('partitions around either menu, recomputes on resize, and restores the full height on close', async () => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  function Layout({ active = true, upper = false, lower = false }) {
    const ref = useRef<HTMLElement>(null);
    useResumeLayout(ref, active, upper, lower);
    return (
      <>
        <nav id="project-menu" />
        <aside ref={ref} />
        <section id="writing-settings" />
      </>
    );
  }
  await act(async () => root!.render(<Layout active={false} />));
  const upper = host.querySelector<HTMLElement>('nav')!;
  const lower = host.querySelector<HTMLElement>('section')!;
  const panel = host.querySelector<HTMLElement>('aside')!;
  for (const [node, height] of [
    [upper, 178],
    [lower, 375],
  ] as const) {
    Object.defineProperties(node, {
      scrollHeight: { get: () => height },
      offsetHeight: {
        get: () =>
          Math.min(
            height,
            parseFloat(node.style.getPropertyValue('--resume-height-limit')) || height,
          ),
      },
    });
  }
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 1000 });
  await act(async () => root!.render(<Layout upper />));
  expect(panel.style.top).toBe('234px');
  expect(panel.style.bottom).toBe('55px');
  await act(async () => root!.render(<Layout lower />));
  expect(panel.style.top).toBe('44px');
  expect(panel.style.bottom).toBe('442px');
  await act(async () => root!.render(<Layout upper lower />));
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 600 });
  await act(async () => window.dispatchEvent(new Event('resize')));
  const free = 600 - parseFloat(panel.style.top) - parseFloat(panel.style.bottom);
  expect(free).toBeGreaterThanOrEqual(140);
  expect(lower.offsetHeight).toBeLessThan(375);
  await act(async () => root!.render(<Layout />));
  expect(panel.style.top).toBe('44px');
  expect(panel.style.bottom).toBe('55px');
  expect(upper.style.getPropertyValue('--resume-height-limit')).toBe('');
  expect(lower.style.getPropertyValue('--resume-height-limit')).toBe('');
  await act(async () => root!.render(<Layout active={false} />));
  expect(panel.style.top).toBe('');
  expect(panel.style.bottom).toBe('');
});
