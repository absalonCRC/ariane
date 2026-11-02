// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useScrollActivity } from '../src/components/useScrollActivity';

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

function Harness() {
  const activity = useScrollActivity();
  return (
    <div data-scrolling={activity.scrolling}>
      <div className="viewport" onScroll={activity.onScroll} onScrollEnd={activity.onScrollEnd} />
    </div>
  );
}

beforeEach(async () => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(<Harness />));
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.useRealTimers();
});

it('shows the chrome during scrolling and hides it shortly after the last movement', async () => {
  const viewport = host.querySelector('.viewport')!;
  const state = () => host.firstElementChild!.getAttribute('data-scrolling');
  expect(state()).toBe('false');
  await act(async () => viewport.dispatchEvent(new Event('scroll')));
  expect(state()).toBe('true');
  await act(async () => vi.advanceTimersByTime(100));
  await act(async () => viewport.dispatchEvent(new Event('scroll')));
  await act(async () => vi.advanceTimersByTime(139));
  expect(state()).toBe('true');
  await act(async () => vi.advanceTimersByTime(1));
  expect(state()).toBe('false');
});

it('hides the chrome immediately when the browser reports the end of scrolling', async () => {
  const viewport = host.querySelector('.viewport')!;
  await act(async () => viewport.dispatchEvent(new Event('scroll')));
  await act(async () => viewport.dispatchEvent(new Event('scrollend')));
  expect(host.firstElementChild!.getAttribute('data-scrolling')).toBe('false');
});
