import { useSyncExternalStore } from 'react';
import type { CapturePreferences } from '../contracts/inbox';
import { native, request } from '../platform/client';
let value: CapturePreferences = {
  shortcut: 'Mod+Shift+Space',
  volume: 1,
  sound: false,
  typewriter: true,
};
let shortcutError: string | null = null;
let activeShortcut: string | null = value.shortcut;
export const activeCaptureShortcut = () => activeShortcut;
const listeners = new Set<() => void>();
export const getCapturePreferences = () => value;
export function useCapturePreferences() {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    () => value,
  );
}
export function captureShortcutError() {
  return shortcutError;
}
export async function loadCapturePreferences() {
  if (!native) return value;
  const result = await request('inboxPreferences', {});
  value = result.value;
  shortcutError = result.shortcutError;
  activeShortcut = result.activeShortcut;
  for (const fn of listeners) fn();
  return value;
}
let queue: Promise<unknown> = Promise.resolve();
export function updateCapturePreferences(patch: Partial<CapturePreferences>) {
  const task = queue.then(async () => {
    const next = { ...value, ...patch };
    const result = await request('inboxPreferences', { value: next });
    value = result.value;
    shortcutError = result.shortcutError;
    activeShortcut = result.activeShortcut;
    for (const fn of listeners) fn();
  });
  queue = task.catch(() => {});
  return task;
}
