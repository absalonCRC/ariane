import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { useExitPresence } from './useExitPresence';

export const EXIT_DURATION = 160;

// Retain the last visible content only for its non-interactive closing transition.
export function usePresenceValue<T>(value: T | null, retain = true) {
  const previous = useRef(value);
  useLayoutEffect(() => {
    if (value !== null) previous.current = value;
  }, [value]);
  const present = useExitPresence(value !== null, retain, EXIT_DURATION);
  return { value: present ? (value ?? previous.current) : null, exiting: value === null };
}

export function Presence({
  children,
  kind = 'panel',
}: {
  children: ReactNode;
  kind?: 'panel' | 'sidebar' | 'anchored' | 'notice' | 'content';
}) {
  const { value, exiting } = usePresenceValue(children ? children : null);
  if (!value) return null;
  return (
    <div
      className="motion-presence"
      data-motion={kind}
      data-phase={exiting ? 'exit' : 'open'}
      inert={exiting}
      aria-hidden={exiting || undefined}
    >
      {value}
    </div>
  );
}
