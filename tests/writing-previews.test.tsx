// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { Settings } from '../src/app/Settings';
import { Editor } from '../src/editor/Editor';
import { defaultSettings, type Settings as Values } from '../src/contracts/settings';
import { type Section } from '../src/contracts/project';
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

it('previews fonts and scrolling in the editor without saving until selection', async () => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
      unobserve() {}
    },
  );
  const rects = Object.getOwnPropertyDescriptor(Range.prototype, 'getClientRects');
  const rect = Object.getOwnPropertyDescriptor(Range.prototype, 'getBoundingClientRect');
  Object.defineProperty(Range.prototype, 'getClientRects', { configurable: true, value: () => [] });
  Object.defineProperty(Range.prototype, 'getBoundingClientRect', {
    configurable: true,
    value: () => new DOMRect(),
  });
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host),
    saved = vi.fn(),
    changed = vi.fn();
  const section: Section = {
    id: 'page',
    parent: null,
    kind: 'scene',
    position: 0,
    title: 'Page',
    text: 'Une phrase.\n\nUn autre paragraphe.',
    revision: 0,
    synopsis: '',
    status: '',
    goal: 0,
  };
  function Harness() {
    const [settings, setSettings] = useState(defaultSettings);
    const [fontPreview, setFontPreview] = useState<Values['font'] | null>(null);
    const [scrollPreview, setScrollPreview] = useState<boolean | null>(null);
    return (
      <div
        data-writing-font={fontPreview ?? settings.font}
        className={(scrollPreview ?? settings.typewriter) ? 'typewriter' : ''}
      >
        <Editor
          sections={[section]}
          generation={1}
          settings={settings}
          scrollPreview={scrollPreview}
          onChange={changed}
          onVisible={vi.fn()}
          onWords={vi.fn()}
          onCharacters={vi.fn()}
          onCursor={vi.fn()}
          onTyping={vi.fn()}
        />
        <Settings
          open
          value={settings}
          onChange={(patch) => {
            saved(patch);
            setSettings((current) => ({ ...current, ...patch }));
          }}
          onFontPreview={setFontPreview}
          onScrollPreview={setScrollPreview}
          onClose={vi.fn()}
          onFormat={vi.fn()}
          canFormat
        />
      </div>
    );
  }
  const enter = (e: Element) => e.dispatchEvent(new MouseEvent('pointerover', { bubbles: true }));
  const leave = (e: Element) =>
    e.dispatchEvent(new MouseEvent('pointerout', { bubbles: true, relatedTarget: document.body }));
  try {
    await act(async () => root.render(<Harness />));
    const container = host.firstElementChild as HTMLElement;
    const serif = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Littéraire · EB Garamond"]',
    )!;
    const sans = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Sans empattement · Figtree"]',
    )!;
    const mono = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Chasse fixe · Source Code Pro"]',
    )!;
    const classic = host.querySelector<HTMLButtonElement>('button[aria-label="Classique"]')!;
    const typewriter = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Machine à écrire"]',
    )!;
    expect([serif, sans, mono, classic, typewriter].every(Boolean)).toBe(true);
    expect(serif.getAttribute('aria-pressed')).toBe('true');
    await act(async () => enter(sans));
    expect(container.dataset.writingFont).toBe('sans');
    expect(saved).not.toHaveBeenCalled();
    await act(async () => leave(sans));
    expect(container.dataset.writingFont).toBe('literary');
    await act(async () => mono.click());
    expect(saved).toHaveBeenLastCalledWith({ font: 'mono' });
    expect(container.dataset.writingFont).toBe('mono');
    saved.mockClear();
    const editor = host.querySelector<HTMLElement>('.cm-editor')!;
    await act(async () => enter(typewriter));
    expect(container.classList.contains('typewriter')).toBe(true);
    expect(editor.dataset.typewriter).toBe('true');
    expect(saved).not.toHaveBeenCalled();
    expect(host.textContent).not.toContain('Son de machine à écrire');
    await act(async () => leave(typewriter));
    expect(container.classList.contains('typewriter')).toBe(false);
    expect(editor.dataset.typewriter).toBe('false');
    await act(async () => typewriter.click());
    expect(saved).toHaveBeenLastCalledWith({ typewriter: true });
    expect(host.textContent).toContain('Son de machine à écrire');
    expect(changed).not.toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
    if (rects) Object.defineProperty(Range.prototype, 'getClientRects', rects);
    else Reflect.deleteProperty(Range.prototype, 'getClientRects');
    if (rect) Object.defineProperty(Range.prototype, 'getBoundingClientRect', rect);
    else Reflect.deleteProperty(Range.prototype, 'getBoundingClientRect');
  }
});
