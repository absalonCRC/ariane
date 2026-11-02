import { useCallback, useEffect, useRef, useState } from 'react';

// The timeout covers browsers that don't emit scrollend, including interrupted gestures.
const SCROLL_END_DELAY = 140;

export function useScrollActivity() {
  const [scrolling, setScrolling] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onScrollEnd = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setScrolling(false);
  }, []);
  const onScroll = useCallback(() => {
    setScrolling(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(onScrollEnd, SCROLL_END_DELAY);
  }, [onScrollEnd]);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  return { scrolling, onScroll, onScrollEnd };
}
