import { t } from '../../i18n';
import { useSyncExternalStore } from 'react';
import { request, native } from '../../platform/client';
import type { ShortcutBindings } from '../../contracts/commands';
import { commandRegistry } from './registry';
const storageName = 'ariane.shortcuts.v1',
  listeners = new Set<() => void>();
function load(): ShortcutBindings {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageName) || '{}');
    return parsed &&
      typeof parsed === 'object' &&
      !Array.isArray(parsed) &&
      Object.values(parsed).every((v) => v === null || typeof v === 'string')
      ? parsed
      : {};
  } catch {
    return {};
  }
}
let bindings = load();
export function effectiveBindings(overrides = bindings): ShortcutBindings {
  return Object.fromEntries(
    commandRegistry.map((c) => [
      c.id,
      Object.hasOwn(overrides, c.id) ? overrides[c.id] : c.shortcut,
    ]),
  );
}
export function shortcutFromEvent(
  e: Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey'>,
): string | null {
  if (['Meta', 'Control', 'Alt', 'Shift', 'Dead', 'Process', 'Unidentified'].includes(e.key))
    return null;
  return [
    ...(e.metaKey || e.ctrlKey ? ['Mod'] : []),
    ...(e.altKey ? ['Alt'] : []),
    ...(e.shiftKey ? ['Shift'] : []),
    e.key.length === 1 ? e.key.toUpperCase() : e.key,
  ].join('+');
}
const reserved = new Set([
  'Mod+Q',
  'Mod+W',
  'Mod+H',
  'Mod+M',
  'Mod+Z',
  'Mod+Shift+Z',
  'Mod+X',
  'Mod+C',
  'Mod+V',
  'Mod+A',
  'Mod+Shift+M',
  'Mod+Space',
  'Alt+Tab',
  'Mod+Tab',
  'Escape',
  'Enter',
  'Backspace',
  'Delete',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
]);
export function shortcutConflict(
  id: string,
  value: string | null,
  overrides = bindings,
): string | null {
  if (value === null) return null;
  if (
    !/^(?:(?:Mod|Alt|Shift)\+)*(?:[A-Z0-9,.;/\[\]\\=\-]|Tab|Arrow(?:Up|Down|Left|Right)|F(?:[1-9]|1[0-2]))$/.test(
      value,
    )
  )
    return 'Raccourci invalide.';
  if (
    (commandRegistry.find((c) => c.id === id)?.scope === 'app' &&
      !value.includes('Mod+') &&
      !/^F\d+$/.test(value)) ||
    reserved.has(value) ||
    (!value.includes('Mod+') &&
      !value.includes('Alt+') &&
      !value.endsWith('Tab') &&
      !/^F\d+$/.test(value))
  )
    return 'Cette combinaison est réservée à la saisie ou au système.';
  const conflict = commandRegistry.find(
    (c) => c.id !== id && effectiveBindings(overrides)[c.id] === value,
  );
  return conflict ? t('Ce raccourci est déjà utilisé : {0}', { 0: t(conflict.label) }) : null;
}
export function nativeBindings(overrides = bindings) {
  return Object.fromEntries(
    commandRegistry
      .filter((c) => c.native)
      .map((c) => {
        const v = effectiveBindings(overrides)[c.id];
        return [
          c.id,
          v
            ?.replace('Mod+', 'CmdOrCtrl+')
            .replace('ArrowUp', 'Up')
            .replace('ArrowDown', 'Down')
            .replace('ArrowLeft', 'Left')
            .replace('ArrowRight', 'Right') ?? null,
        ];
      }),
  );
}
export async function setShortcut(id: string, value: string | null) {
  const error = shortcutConflict(id, value);
  if (error) throw Error(error);
  const next = { ...bindings, [id]: value };
  if (native) {
    await syncNative(nativeBindings(next));
    if (recording) await syncNative(disabledNative());
  }
  try {
    localStorage.setItem(storageName, JSON.stringify(next));
  } catch (e) {
    if (native) await syncNative(recording ? disabledNative() : nativeBindings());
    throw e;
  }
  bindings = next;
  for (const fn of listeners) fn();
}
export async function resetShortcuts() {
  if (native) await syncNative(recording ? disabledNative() : nativeBindings({}));
  try {
    localStorage.removeItem(storageName);
  } catch (e) {
    if (native) await syncNative(recording ? disabledNative() : nativeBindings());
    throw e;
  }
  bindings = {};
  for (const fn of listeners) fn();
}
export function useShortcuts() {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    () => bindings,
  );
}
let requested = false;
export function requestShortcutSettings() {
  requested = true;
  window.dispatchEvent(new Event('ariane-shortcuts-open'));
}
export function consumeShortcutSettings() {
  const value = requested;
  requested = false;
  return value;
}

let recording = false;
let nativeQueue: Promise<unknown> = Promise.resolve();
function syncNative(values: Record<string, string | null>) {
  const next = nativeQueue.then(() => request('appShortcuts', { bindings: values }));
  nativeQueue = next.catch(() => {});
  return next;
}
const disabledNative = () =>
  Object.fromEntries(commandRegistry.filter((c) => c.native).map((c) => [c.id, null]));
export async function beginShortcutRecording() {
  recording = true;
  if (native) await syncNative(disabledNative());
}
export async function endShortcutRecording() {
  recording = false;
  if (native) await syncNative(nativeBindings());
}
