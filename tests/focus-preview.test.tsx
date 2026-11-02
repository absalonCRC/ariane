// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { Settings } from '../src/app/Settings';
import { Editor } from '../src/editor/Editor';
import { defaultSettings, type Section, type Settings as Values } from '../src/app/types';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

it('temporarily previews concentration in the manuscript and applies it only on selection', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const rects = Object.getOwnPropertyDescriptor(Range.prototype, 'getClientRects');
  const rect = Object.getOwnPropertyDescriptor(Range.prototype, 'getBoundingClientRect');
  Object.defineProperty(Range.prototype, 'getClientRects', { configurable: true, value: () => [] });
  Object.defineProperty(Range.prototype, 'getBoundingClientRect', {
    configurable: true,
    value: () => new DOMRect(),
  });
  const section: Section = {
    id: 'page',
    parent: null,
    kind: 'scene',
    position: 0,
    title: 'Page',
    text: 'Première phrase. Deuxième phrase.\n\nUn autre paragraphe. Sa dernière phrase.   \n\n',
    revision: 0,
    synopsis: '',
    status: '',
    goal: 0,
  };
  const change = vi.fn();
  const saved = vi.fn();
  function Harness() {
    const [settings, setSettings] = useState(defaultSettings);
    const [preview, setPreview] = useState<Values['focus'] | null>(null);
    const [open, setOpen] = useState(true);
    return (
      <>
        <Editor
          sections={[section]}
          generation={1}
          settings={settings}
          focusPreview={open ? preview : null}
          onChange={change}
          onVisible={vi.fn()}
          onWords={vi.fn()}
          onCharacters={vi.fn()}
          onCursor={vi.fn()}
          onTyping={vi.fn()}
        />
        <Settings
          open={open}
          value={settings}
          onChange={(patch) => {
            saved(patch);
            setSettings((current) => ({ ...current, ...patch }));
          }}
          onClose={() => setOpen(false)}
          onFocusPreview={setPreview}
          onFormat={vi.fn()}
          canFormat
        />
      </>
    );
  }
  const hover = (element: Element) =>
    element.dispatchEvent(new MouseEvent('pointerover', { bubbles: true }));
  const leave = (element: Element) =>
    element.dispatchEvent(
      new MouseEvent('pointerout', { bubbles: true, relatedTarget: document.body }),
    );
  try {
    await act(async () => root.render(<Harness />));
    const editor = host.querySelector<HTMLElement>('.cm-editor')!;
    const phrase = host.querySelector<HTMLButtonElement>('button[aria-label="Phrase"]')!;
    const word = host.querySelector<HTMLButtonElement>('button[aria-label="Mot"]')!;
    const paragraph = host.querySelector<HTMLButtonElement>('button[aria-label="Paragraphe"]')!;
    expect(editor.dataset.focus).toBe('none');
    await act(async () => hover(phrase));
    expect(editor.dataset.focus).toBe('sentence');
    expect(editor.querySelector('.focused-sentence')?.textContent).toContain('Sa dernière phrase.');
    expect(phrase.getAttribute('aria-pressed')).toBe('false');
    expect(saved).not.toHaveBeenCalled();
    expect(change).not.toHaveBeenCalled();
    await act(async () => leave(phrase));
    expect(editor.dataset.focus).toBe('none');
    await act(async () => hover(word));
    expect(editor.dataset.focus).toBe('word');
    expect(editor.querySelector('.focused-word')?.textContent).toBe('phrase');
    expect(saved).not.toHaveBeenCalled();
    await act(async () => leave(word));
    expect(editor.dataset.focus).toBe('none');
    await act(async () => hover(paragraph));
    expect(editor.querySelector('.focused-line')?.textContent).toContain('Un autre paragraphe.');
    expect(saved).not.toHaveBeenCalled();
    await act(async () => leave(paragraph));
    await act(async () => paragraph.click());
    expect(saved).toHaveBeenLastCalledWith({ focus: 'paragraph' });
    expect(editor.dataset.focus).toBe('paragraph');
    expect(editor.querySelector('.focused-line')).not.toBeNull();
    await act(async () => hover(phrase));
    expect(editor.dataset.focus).toBe('sentence');
    expect(editor.querySelector('.focused-sentence')?.textContent).toContain('Sa dernière phrase.');
    await act(async () => leave(phrase));
    expect(editor.dataset.focus).toBe('paragraph');
    await act(async () => hover(phrase));
    await act(async () =>
      host.querySelector<HTMLButtonElement>('button[aria-label="Fermer les réglages"]')!.click(),
    );
    expect(editor.dataset.focus).toBe('paragraph');
    await act(async () => word.click());
    expect(saved).toHaveBeenLastCalledWith({ focus: 'word' });
    expect(editor.dataset.focus).toBe('word');
    expect(editor.querySelector('.focused-word')).not.toBeNull();
    expect(change).not.toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount());
    host.remove();
    if (rects) Object.defineProperty(Range.prototype, 'getClientRects', rects);
    else Reflect.deleteProperty(Range.prototype, 'getClientRects');
    if (rect) Object.defineProperty(Range.prototype, 'getBoundingClientRect', rect);
    else Reflect.deleteProperty(Range.prototype, 'getBoundingClientRect');
  }
});
