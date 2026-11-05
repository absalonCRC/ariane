// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { WindowDragRegion } from '../src/components/WindowDragRegion';
const drag = vi.hoisted(() => vi.fn(async () => {}));
vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: () => ({ startDragging: drag }) }));
vi.mock('../src/platform/client', () => ({ native: true }));
it('starts native dragging only on a left click and reports failures', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = document.createElement('div'),
    root = createRoot(host),
    fail = vi.fn();
  try {
    await act(async () => root.render(<WindowDragRegion onError={fail} />));
    const region = host.firstElementChild!;
    await act(async () => {
      region.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 2 }));
    });
    expect(drag).not.toHaveBeenCalled();
    await act(async () => {
      region.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    });
    expect(drag).toHaveBeenCalledOnce();
    drag.mockRejectedValueOnce(new Error('Déplacement indisponible'));
    await act(async () => {
      region.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    });
    expect(fail).toHaveBeenCalledWith(expect.any(Error));
  } finally {
    await act(async () => root.unmount());
  }
});
