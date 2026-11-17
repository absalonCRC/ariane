import { useEffect, useRef, useState } from 'react';
import { registerWindowFlusher } from '../platform/windowFlush';
import { WritingActivityStore } from './writingActivity';
export function useWritingActivity(onError: (error: unknown) => void) {
  const fail = useRef(onError);
  fail.current = onError;
  const [store] = useState(
    () =>
      new WritingActivityStore(
        {
          getItem: (key) => localStorage.getItem(key),
          setItem: (key, value) => localStorage.setItem(key, value),
        },
        (error) => fail.current(error),
      ),
  );
  useEffect(() => {
    const unregister = registerWindowFlusher(store.flush);
    const hidden = () => {
      if (document.visibilityState === 'hidden') store.flushSafely();
    };
    window.addEventListener('pagehide', store.flushSafely);
    document.addEventListener('visibilitychange', hidden);
    store.flushSafely();
    return () => {
      unregister();
      window.removeEventListener('pagehide', store.flushSafely);
      document.removeEventListener('visibilitychange', hidden);
      store.dispose();
    };
  }, [store]);
  return store;
}
