import { useEffect, useState } from 'react';

// Keep the outgoing content in place while its shared surface closes.
export function useExitPresence(open: boolean, retain: boolean, duration = 320) {
  const [present, setPresent] = useState(open);
  useEffect(() => {
    if (open) {
      setPresent(true);
      return;
    }
    if (!retain) {
      setPresent(false);
      return;
    }
    const timer = window.setTimeout(() => setPresent(false), duration);
    return () => window.clearTimeout(timer);
  }, [open, retain, duration]);
  return open || (retain && present);
}
