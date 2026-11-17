// @vitest-environment jsdom
import { act, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { WorkspaceScreen, WorkspaceScreenHost } from '../src/components/WorkspaceScreen';
it('keeps project pages outside the dialog layer, locks navigation while busy, and leaves selects in control of Escape', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const close = vi.fn(),
    busy = vi.fn();
  let setBusy!: (value: boolean) => void;
  function Harness() {
    const [target, setTarget] = useState<HTMLElement | null>(null),
      [working, work] = useState(false);
    setBusy = work;
    const returnFocus = useRef<HTMLElement | null>(null);
    const context = useMemo(() => ({ target, returnFocus, onBusy: busy }), [target]);
    return (
      <>
        <button>Cadre</button>
        <main ref={setTarget} />
        <WorkspaceScreenHost value={context}>
          <WorkspaceScreen title="Profil" onClose={close} onError={() => {}} busy={working}>
            <select aria-label="Choix">
              <option>A</option>
            </select>
          </WorkspaceScreen>
        </WorkspaceScreenHost>
      </>
    );
  }
  try {
    await act(async () => root.render(<Harness />));
    const page = host.querySelector<HTMLElement>('.workspace-page')!;
    expect(page.parentElement?.tagName).toBe('MAIN');
    expect(host.querySelector('dialog')).toBeNull();
    expect(document.activeElement).toBe(page);
    await act(async () => setBusy(true));
    expect(busy).toHaveBeenLastCalledWith(true);
    expect(page.querySelector<HTMLButtonElement>('.workspace-return')!.disabled).toBe(true);
    await act(async () =>
      page.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
      ),
    );
    expect(close).not.toHaveBeenCalled();
    await act(async () => setBusy(false));
    await act(async () =>
      page
        .querySelector('select')!
        .dispatchEvent(
          new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
        ),
    );
    expect(close).not.toHaveBeenCalled();
    await act(async () =>
      page.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
      ),
    );
    expect(close).toHaveBeenCalledOnce();
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
  expect(busy).toHaveBeenLastCalledWith(false);
});
