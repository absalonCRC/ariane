// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { useWindowLifecycle } from '../src/platform/useWindowLifecycle';
import { registerWindowFlusher } from '../src/platform/windowFlush';

const runtime = vi.hoisted(() => ({
  listeners: new Map<string, (event: { payload: unknown }) => unknown>(),
  request: vi.fn(async () => true),
  close: vi.fn(),
}));
vi.mock('../src/platform/client', () => ({ native: true, request: runtime.request }));
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async (name, callback) => {
    runtime.listeners.set(name, callback);
    return () => runtime.listeners.delete(name);
  }),
}));
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({
    label: 'capture',
    onCloseRequested: async (callback: unknown) => {
      runtime.close(callback);
      return () => {};
    },
  }),
}));

it('waits for resource cleanup and durable text before acknowledging, blocks late input, and resumes on failure', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  runtime.request.mockClear();
  const order: string[] = [];
  const dispose = registerWindowFlusher(async () => {
    order.push('audio stopped');
  });
  const flush = vi.fn(async () => {
    order.push('text committed');
  });
  const fail = vi.fn();
  function Harness() {
    const suspended = useWindowLifecycle(flush, fail);
    return <input readOnly={suspended} />;
  }
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => {
      root.render(<Harness />);
    });
    await vi.waitFor(() => expect(runtime.request).toHaveBeenCalledWith('appReady'));
    let task: unknown;
    await act(async () => {
      task = runtime.listeners.get('app-flush-requested')!({
        payload: { id: 'flush-1', action: 'quit' },
      });
    });
    const input = new Event('beforeinput', { bubbles: true, cancelable: true });
    host.querySelector('input')!.dispatchEvent(input);
    expect(input.defaultPrevented).toBe(true);
    expect(runtime.request).not.toHaveBeenCalledWith('appFlushed', expect.anything());
    await act(async () => {
      await task;
    });
    expect(order).toEqual(['audio stopped', 'text committed']);
    expect(runtime.request).toHaveBeenCalledWith('appFlushed', { id: 'flush-1' });
    expect(host.querySelector('input')!.readOnly).toBe(true);
    await act(async () => {
      runtime.listeners.get('app-flush-complete')!({ payload: 'flush-1' });
    });
    expect(host.querySelector('input')!.readOnly).toBe(false);
    flush.mockRejectedValueOnce(Error('disk unavailable'));
    await act(async () => {
      await runtime.listeners.get('app-flush-requested')!({
        payload: { id: 'flush-2', action: 'hide-capture' },
      });
    });
    expect(runtime.request).toHaveBeenCalledWith('appFlushed', {
      id: 'flush-2',
      error: 'Error: disk unavailable',
    });
    expect(fail).toHaveBeenCalledWith(Error('disk unavailable'));
    expect(document.documentElement.dataset.flushing).toBeUndefined();
  } finally {
    await act(async () => root.unmount());
    host.remove();
    dispose();
  }
  expect(runtime.listeners.size).toBe(0);
});
