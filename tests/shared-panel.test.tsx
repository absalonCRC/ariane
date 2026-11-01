// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useSharedPanel, type PanelOrigin } from '../src/components/useSharedPanel';

let host: HTMLDivElement, writing: HTMLDivElement, scroller: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
let height = 375;
let previousAnimate: PropertyDescriptor | undefined;
let previousMatchMedia: PropertyDescriptor | undefined;
const animate = vi.fn(() => ({ finished: Promise.resolve(), cancel: vi.fn() }));
const origin: PanelOrigin = {
  left: 809,
  top: 180,
  width: 190,
  height: 54,
  label: 'Carnet',
  scrollTop: 70,
  rightInset: 25,
};
function Panel({ close }: { close: () => void }) {
  const ref = useSharedPanel(origin, 'source', close);
  return (
    <section ref={ref} className="shared-panel">
      <div className="shared-panel-label">Carnet</div>
      <button>Fermer</button>
    </section>
  );
}
beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div');
  writing = document.createElement('div');
  writing.id = 'writing-settings';
  scroller = document.createElement('div');
  scroller.className = 'manuscript-column';
  scroller.scrollTop = 70;
  vi.spyOn(scroller, 'getBoundingClientRect').mockReturnValue(new DOMRect(100, 55, 700, 650));
  height = 375;
  Object.defineProperties(writing, {
    offsetHeight: { get: () => height },
    offsetWidth: { get: () => 310 },
  });
  document.body.append(scroller, writing, host);
  root = createRoot(host);
  previousAnimate = Object.getOwnPropertyDescriptor(Element.prototype, 'animate');
  previousMatchMedia = Object.getOwnPropertyDescriptor(window, 'matchMedia');
  Object.defineProperty(Element.prototype, 'animate', { configurable: true, value: animate });
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: () => ({ matches: false }),
  });
  animate.mockClear();
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  writing.remove();
  scroller.remove();
  if (previousAnimate) Object.defineProperty(Element.prototype, 'animate', previousAnimate);
  else Reflect.deleteProperty(Element.prototype, 'animate');
  if (previousMatchMedia) Object.defineProperty(window, 'matchMedia', previousMatchMedia);
  else Reflect.deleteProperty(window, 'matchMedia');
});
it('grows in place from the clicked suggestion while keeping the compact card dimensions', async () => {
  const close = vi.fn();
  await act(async () => root.render(<Panel close={close} />));
  const panel = host.querySelector<HTMLElement>('section')!;
  expect(panel.style.height).toBe('375px');
  expect(panel.style.width).toBe('310px');
  expect(panel.style.top).toBe('180px');
  expect(panel.style.left).toBe('689px');
  expect(animate).toHaveBeenCalled();
  const frames = (animate.mock.calls as unknown as [Keyframe[], KeyframeAnimationOptions][])[0][0];
  expect(frames[0]).toMatchObject({ left: '809px', top: '180px', width: '190px', height: '54px' });
  height = 420;
  await act(async () => window.dispatchEvent(new Event('resize')));
  expect(panel.style.height).toBe('420px');
  await act(async () =>
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true })),
  );
  expect(close).toHaveBeenCalledOnce();
});
it('keeps its document anchor without animation when reduced motion is requested', async () => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: () => ({ matches: true }),
  });
  await act(async () => root.render(<Panel close={() => {}} />));
  expect(animate).not.toHaveBeenCalled();
  expect(host.querySelector<HTMLElement>('section')!.style.height).toBe('375px');
  expect(document.activeElement?.textContent).toBe('Fermer');
});

it('moves by the document scroll delta and leaves the viewport instead of sticking to an edge', async () => {
  await act(async () => root.render(<Panel close={() => {}} />));
  const panel = host.querySelector<HTMLElement>('section')!;
  scroller.scrollTop = 145;
  await act(async () => scroller.dispatchEvent(new Event('scroll')));
  expect(panel.style.top).toBe('105px');
  scroller.scrollTop = 600;
  await act(async () => scroller.dispatchEvent(new Event('scroll')));
  expect(panel.style.top).toBe('-350px');
  expect(panel.style.clipPath).toContain('405px');
});
it('forwards the wheel over a card to the document when its content cannot scroll further', async () => {
  await act(async () => root.render(<Panel close={() => {}} />));
  const panel = host.querySelector<HTMLElement>('section')!;
  const wheel = new WheelEvent('wheel', { deltaY: 60, bubbles: true, cancelable: true });
  await act(async () => panel.dispatchEvent(wheel));
  expect(wheel.defaultPrevented).toBe(true);
  expect(scroller.scrollTop).toBe(130);
  expect(panel.style.top).toBe('120px');
});
