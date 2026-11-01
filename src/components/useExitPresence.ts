import { useEffect, useState } from 'react';
import { useReducedMotion } from './useReducedMotion';

// Keep the outgoing content in place while its shared surface closes.
export function useExitPresence(open: boolean, retain: boolean, duration = 320) {
  const reduced = useReducedMotion();
  const [present, setPresent] = useState(open);
  useEffect(() => {
    if (open) {
      setPresent(true);
      return;
    }
    if (!retain || reduced) {
      setPresent(false);
      return;
    }
    const timer = window.setTimeout(() => setPresent(false), duration);
    return () => window.clearTimeout(timer);
  }, [open, retain, duration, reduced]);
  return open || (!reduced && retain && present);
}
