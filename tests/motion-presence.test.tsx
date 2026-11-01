// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { Presence, EXIT_DURATION } from '../src/components/Presence';
import { AnimatedDetails } from '../src/components/AnimatedDetails';

let host: HTMLDivElement, root: ReturnType<typeof createRoot>;
let originalMedia: PropertyDescriptor | undefined, originalAnimate: PropertyDescriptor | undefined;
beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  originalMedia = Object.getOwnPropertyDescriptor(window, 'matchMedia');
  originalAnimate = Object.getOwnPropertyDescriptor(Element.prototype, 'animate');
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.useRealTimers();
  if (originalMedia) Object.defineProperty(window, 'matchMedia', originalMedia);
  else Reflect.deleteProperty(window, 'matchMedia');
  if (originalAnimate) Object.defineProperty(Element.prototype, 'animate', originalAnimate);
  else Reflect.deleteProperty(Element.prototype, 'animate');
});
function Toggle() {
  const [open, setOpen] = useState(true);
  return (
    <>
      <button onClick={() => setOpen(!open)}>toggle</button>
      <Presence>{open && <aside>Panel</aside>}</Presence>
    </>
  );
}
it('keeps exiting content inert, cancels stale removal when reopened, then removes it after its exit', async () => {
  vi.useFakeTimers();
  await act(async () => root.render(<Toggle />));
  const trigger = host.querySelector('button')!,
    panel = host.querySelector('aside')!;
  await act(async () => trigger.click());
  expect(panel.parentElement?.hasAttribute('inert')).toBe(true);
  expect(panel.parentElement?.getAttribute('aria-hidden')).toBe('true');
  await act(async () => {
    vi.advanceTimersByTime(80);
    trigger.click();
  });
  await act(async () => vi.advanceTimersByTime(EXIT_DURATION));
  expect(host.querySelector('aside')).toBe(panel);
  expect(panel.parentElement?.hasAttribute('inert')).toBe(false);
  await act(async () => trigger.click());
  await act(async () => vi.advanceTimersByTime(EXIT_DURATION));
  expect(host.querySelector('aside')).toBeNull();
});
it('removes panels immediately when reduced motion is enabled', async () => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: () => ({ matches: true }),
  });
  await act(async () => root.render(<Toggle />));
  await act(async () => host.querySelector('button')!.click());
  expect(host.querySelector('aside')).toBeNull();
});
it('keeps details usable across rapid close/reopen and ignores obsolete animation completions', async () => {
  const animations: { finish: () => void; cancel: ReturnType<typeof vi.fn> }[] = [];
  Object.defineProperty(Element.prototype, 'animate', {
    configurable: true,
    value: () => {
      let finish!: () => void;
      const finished = new Promise<void>((resolve) => {
        finish = resolve;
      });
      const cancel = vi.fn();
      animations.push({ finish, cancel });
      return { finished, cancel };
    },
  });
  await act(async () =>
    root.render(
      <AnimatedDetails summary="Détails">
        <button>Lire</button>
      </AnimatedDetails>,
    ),
  );
  const details = host.querySelector('details')!,
    summary = host.querySelector('summary')!;
  const click = async () => {
    await act(async () =>
      summary.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })),
    );
  };
  await click();
  expect(details.open).toBe(true);
  expect(summary.getAttribute('aria-expanded')).toBe('true');
  await click();
  expect(details.open).toBe(true);
  expect(summary.getAttribute('aria-expanded')).toBe('false');
  expect(host.querySelector<HTMLElement>('.details-content')!.inert).toBe(true);
  await click();
  expect(summary.getAttribute('aria-expanded')).toBe('true');
  await act(async () => animations[1].finish());
  expect(details.open).toBe(true);
  await act(async () => animations[2].finish());
  await click();
  await act(async () => animations[3].finish());
  expect(details.open).toBe(false);
  expect(details.style.overflow).toBe('');
});
