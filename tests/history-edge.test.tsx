// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { HistoryEdge } from '../src/app/chrome/HistoryEdge';
import { WorkspaceHeader } from '../src/app/chrome/WorkspaceHeader';
import { ControlHints } from '../src/components/ControlHints';
let host: HTMLDivElement, root: ReturnType<typeof createRoot>;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.useFakeTimers();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.useRealTimers();
});
it('uses the right edge for history and removes the former header action', async () => {
  const toggle = vi.fn();
  await act(async () =>
    root.render(
      <>
        <WorkspaceHeader
          libraryBusy={false}
          binder={false}
          historyMode={false}
          immersiveFocus={false}
          onToggleFocus={() => {}}
          menu={false}
          setMenu={() => {}}
          commands={[]}
        />
        <HistoryEdge open={false} onToggle={toggle} />
      </>,
    ),
  );
  expect(host.querySelector('.app-header .resume-trigger')).toBeNull();
  expect(host.querySelector('.app-header [aria-label="Reprendre le fil"]')).toBeNull();
  expect(host.querySelector('.focus-mode-trigger')).not.toBeNull();
  const edge = host.querySelector<HTMLButtonElement>('.history-edge-trigger')!;
  expect(edge.getAttribute('aria-expanded')).toBe('false');
  expect(edge.getAttribute('aria-controls')).toBe('project-activity-history');
  await act(async () => edge.click());
  expect(toggle).toHaveBeenCalledOnce();
  await act(async () => root.render(<HistoryEdge open disabled onToggle={toggle} />));
  const disabled = host.querySelector('button')!;
  expect(disabled.getAttribute('aria-label')).toBe('Replier l’historique');
  await act(async () => disabled.click());
  expect(toggle).toHaveBeenCalledOnce();
});
it('shows Historique beside the pointer without opening the panel on hover', async () => {
  const toggle = vi.fn();
  await act(async () =>
    root.render(
      <>
        <ControlHints />
        <HistoryEdge open={false} onToggle={toggle} />
      </>,
    ),
  );
  const edge = host.querySelector('button')!;
  vi.spyOn(edge, 'getBoundingClientRect').mockReturnValue({
    left: 976,
    right: 1000,
    top: 36,
    bottom: 700,
    width: 24,
    height: 664,
    x: 976,
    y: 36,
    toJSON: () => ({}),
  });
  await act(async () => {
    edge.dispatchEvent(new MouseEvent('pointerover', { bubbles: true, clientY: 260 }));
    edge.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientY: 260 }));
    vi.advanceTimersByTime(350);
  });
  expect(document.querySelector('.control-hint')?.textContent).toBe('Historique');
  expect(edge.style.getPropertyValue('--sidebar-chevron-y')).toBe('224px');
  expect(toggle).not.toHaveBeenCalled();
  expect(edge.getAttribute('aria-expanded')).toBe('false');
});
