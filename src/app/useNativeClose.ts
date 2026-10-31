import { useEffect, useRef } from 'react';
import { native, request } from './client';
export function useNativeClose(
  flush: () => Promise<void>,
  saveSession: () => Promise<unknown>,
  onError: (e: unknown) => void,
) {
  const latest = useRef({ flush, saveSession, onError });
  latest.current = { flush, saveSession, onError };
  useEffect(() => {
    if (!native) return;
    let unlisten: (() => void)[] = [];
    let active = true;
    let closing = false;
    const close = async () => {
      if (closing) return;
      closing = true;
      try {
        // Native keyboard/clipboard events can reach WKWebView after the Quit
        // request crosses IPC. Let that input settle before acknowledging exit.
        await new Promise<void>((resolve) => setTimeout(resolve, 75));
        await latest.current.flush();
        await latest.current.saveSession();
        await request('quit');
      } catch (error) {
        closing = false;
        latest.current.onError(error);
      }
    };
    Promise.all([
      import('@tauri-apps/api/window').then(({ getCurrentWindow }) =>
        getCurrentWindow().onCloseRequested((e) => {
          e.preventDefault();
          void close();
        }),
      ),
      import('@tauri-apps/api/event').then(({ listen }) =>
        listen('app-close-requested', () => void close()),
      ),
    ]).then((listeners) => {
      if (active) unlisten = listeners;
      else listeners.forEach((dispose) => dispose());
    });
    return () => {
      active = false;
      unlisten.forEach((dispose) => dispose());
    };
  }, []);
}
