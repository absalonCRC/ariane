// @vitest-environment jsdom
import { expect, it } from 'vitest';
import {
  shortcutConflict,
  shortcutFromEvent,
  effectiveBindings,
  setShortcut,
  resetShortcuts,
} from '../src/app/commands/shortcuts';
it('rejects collisions and protected editing keys, saves a replacement and resets defaults', async () => {
  expect(shortcutConflict('focus', 'Mod+F')).toContain('déjà');
  expect(shortcutConflict('focus', 'Mod+Z')).toContain('réservée');
  expect(shortcutConflict('focus', 'A')).toContain('réservée');
  expect(
    shortcutFromEvent({ key: 'f', metaKey: true, ctrlKey: false, altKey: true, shiftKey: true }),
  ).toBe('Mod+Alt+Shift+F');
  await setShortcut('focus', 'Mod+Alt+L');
  expect(effectiveBindings().focus).toBe('Mod+Alt+L');
  expect(JSON.parse(localStorage.getItem('ariane.shortcuts.v1')!).focus).toBe('Mod+Alt+L');
  await expect(setShortcut('binder', 'Mod+Alt+L')).rejects.toThrow(/déjà/);
  await resetShortcuts();
  expect(effectiveBindings().focus).toBe('Mod+Shift+F');
});
