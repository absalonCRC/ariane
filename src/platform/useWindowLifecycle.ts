import { flushWindowResources } from './windowFlush';
import { useEffect, useRef, useState } from 'react';
import { native, request } from './client';
export function useWindowLifecycle(
  flush: () => Promise<unknown>,
  onError: (error: unknown) => void,
) {
  const latest = useRef({ flush, onError });
  latest.current = { flush, onError };
  const [suspended, setSuspended] = useState(false);
  useEffect(() => {
    if (!native) return;
    let disposed = false;
    const cleanups: (() => void)[] = [];
    let pending: string | null = null;
    const add = (fn: () => void) => {
      if (disposed) fn();
      else cleanups.push(fn);
    };
    const resume = () => {
      pending = null;
      setSuspended(false);
      delete document.documentElement.dataset.flushing;
    };
    void (async () => {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      const window = getCurrentWindow();
      const { listen } = await import('@tauri-apps/api/event');
      add(
        await listen<{ id: string; action: string }>('app-flush-requested', async ({ payload }) => {
          if (disposed || pending === payload.id) return;
          pending = payload.id;
          setSuspended(true);
          document.documentElement.dataset.flushing = 'true';
          try {
            await new Promise<void>((r) => setTimeout(r, 75));
            await flushWindowResources();
            await latest.current.flush();
            await request('appFlushed', { id: payload.id });
          } catch (e) {
            await request('appFlushed', { id: payload.id, error: String(e) }).catch(
              latest.current.onError,
            );
            resume();
            latest.current.onError(e);
          }
        }),
      );
      add(await listen('app-flush-complete', resume));
      add(
        await listen<string>('app-lifecycle-error', (e) => {
          resume();
          latest.current.onError(e.payload);
        }),
      );
      add(
        await window.onCloseRequested((e) => {
          e.preventDefault();
          void request('appClose', {
            action: window.label === 'capture' ? 'hide-capture' : 'hide-main',
          }).catch(latest.current.onError);
        }),
      );
      if (!disposed) await request('appReady');
    })().catch((e) => latest.current.onError(e));
    const prevent = (event: Event) => {
      if (pending) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };
    const inputs = ['beforeinput', 'keydown', 'paste', 'cut', 'drop', 'pointerdown'];
    inputs.forEach((type) => document.addEventListener(type, prevent, true));
    return () => {
      disposed = true;
      cleanups.forEach((fn) => fn());
      inputs.forEach((type) => document.removeEventListener(type, prevent, true));
      delete document.documentElement.dataset.flushing;
    };
  }, []);
  return suspended;
}
