// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { WritingModes } from '../src/components/WritingModes';
import { DepthControl } from '../src/components/DepthControl';
import { Settings } from '../src/app/Settings';
import { defaultSettings } from '../src/contracts/settings';
import { ControlHints } from '../src/components/ControlHints';
let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});
it('previews on pointer and keyboard focus without applying the setting', async () => {
  const change = vi.fn();
  const preview = vi.fn();
  await act(async () =>
    root.render(
      <>
        <ControlHints />
        <WritingModes value={defaultSettings} onChange={change} onFocusPreview={preview} />
      </>,
    ),
  );
  const phrase = host.querySelector<HTMLButtonElement>('button[aria-label="Phrase"]')!;
  expect(phrase).not.toBeNull();
  expect(phrase.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
  expect(phrase.textContent).toBe('');
  await act(async () => phrase.dispatchEvent(new MouseEvent('pointerover', { bubbles: true })));
  expect(preview).toHaveBeenLastCalledWith('sentence');
  await act(async () => new Promise((resolve) => setTimeout(resolve, 400)));
  expect(document.querySelector('[role="tooltip"]')?.textContent).toBe('Phrase');
  expect(change).not.toHaveBeenCalled();
  await act(async () =>
    phrase.dispatchEvent(
      new MouseEvent('pointerout', { bubbles: true, relatedTarget: document.body }),
    ),
  );
  expect(preview).toHaveBeenLastCalledWith(null);
  expect(document.querySelector('[role="tooltip"]')).toBeNull();
  await act(async () => phrase.focus());
  expect(preview).toHaveBeenLastCalledWith('sentence');
  expect(change).not.toHaveBeenCalled();
  await act(async () =>
    phrase.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })),
  );
  expect(preview).toHaveBeenLastCalledWith(null);
  expect(document.activeElement).toBe(phrase);
  await act(async () => phrase.click());
  expect(change).toHaveBeenCalledWith({ focus: 'sentence' });
});
it('returns focus to depth control before hiding its slider', async () => {
  await act(async () => root.render(<DepthControl value={3} onChange={() => {}} />));
  const trigger = host.querySelector('button')!;
  const slider = host.querySelector('input')!;
  expect(trigger.textContent).toBe('Sources proches');
  expect(slider.getAttribute('aria-valuetext')).toBe('Niveau 3 : Sources proches');
  await act(async () => slider.focus());
  expect(host.textContent).toBe('Sources proches3');
  await act(async () =>
    slider.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })),
  );
  expect(document.activeElement).toBe(trigger);
  expect(trigger.getAttribute('aria-expanded')).toBe('false');
});
it('returns focus to the settings trigger after Escape', async () => {
  function Harness() {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button onClick={() => setOpen(true)}>Ouvrir</button>
        <Settings
          open={open}
          value={defaultSettings}
          onChange={() => {}}
          onClose={() => setOpen(false)}
          onFormat={() => {}}
          canFormat={false}
        />
      </>
    );
  }
  await act(async () => root.render(<Harness />));
  const trigger = host.querySelector('button')!;
  await act(async () => {
    trigger.focus();
    trigger.click();
  });
  expect(document.activeElement?.getAttribute('aria-label')).toBe('Fermer les réglages');
  await act(async () =>
    document.activeElement!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    ),
  );
  expect(document.activeElement).toBe(trigger);
  expect(host.querySelector('section')?.getAttribute('aria-hidden')).toBe('true');
});
