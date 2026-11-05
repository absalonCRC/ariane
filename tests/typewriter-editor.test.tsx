// @vitest-environment jsdom
import { act, createRef } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { Editor, type EditorHandle } from '../src/editor/Editor';
import { defaultSettings } from '../src/contracts/settings';
import { type Section } from '../src/contracts/project';
const audio = vi.hoisted(() => ({ play: vi.fn(), destroy: vi.fn() }));
vi.mock('../src/editor/typewriterSound', () => ({ createTypewriterSound: () => audio }));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

it('plays only for typing in the editable manuscript and stops immediately when disabled', async () => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const ref = createRef<EditorHandle>();
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
    text: 'Texte\n\n| Nom | Valeur |\n| --- | --- |\n| Un | Deux |',
    revision: 0,
    synopsis: '',
    status: '',
    goal: 0,
  };
  const props = {
    sections: [section],
    generation: 1,
    onChange: vi.fn(),
    onVisible: vi.fn(),
    onWords: vi.fn(),
    onCharacters: vi.fn(),
    onCursor: vi.fn(),
    onTyping: vi.fn(),
  };
  const render = (enabled: boolean, readOnly = false, typewriter = true) =>
    root.render(
      <Editor
        {...props}
        settings={{ ...defaultSettings, typewriter, typewriterSound: enabled }}
        readOnly={readOnly}
        ref={ref}
      />,
    );
  const press = (target: Element, key: string, extra: KeyboardEventInit = {}) =>
    target.dispatchEvent(
      new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...extra }),
    );
  try {
    await act(async () => render(false));
    const content = host.querySelector('.cm-content')!;
    await act(async () => press(content, 'a'));
    expect(audio.play).not.toHaveBeenCalled();
    await act(async () => render(true));
    await act(async () => {
      press(content, 'a');
      press(content, ' ');
      press(content, 'Backspace');
      press(content, 'Delete');
      press(content, 'Enter');
      press(content, 'a', { metaKey: true });
      press(content, 'a', { ctrlKey: true });
      press(content, 'ArrowLeft');
      press(content, 'Shift');
      press(content, 'Dead');
      press(content, 'a', { isComposing: true });
    });
    expect(audio.play.mock.calls.map(([kind]) => kind)).toEqual([
      'key',
      'space',
      'delete',
      'delete',
      'return',
    ]);
    audio.play.mockClear();
    await act(async () => ref.current?.insert('Texte collé'));
    expect(audio.play).not.toHaveBeenCalled();
    const cell = host.querySelector('.markdown-table-preview td')!;
    await act(async () =>
      cell.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })),
    );
    const input = cell.querySelector('input')!;
    await act(async () => {
      press(input, 'b');
      press(input, 'Enter');
    });
    expect(audio.play.mock.calls.map(([kind]) => kind)).toEqual(['key']);
    audio.play.mockClear();
    await act(async () => render(true, true));
    await act(async () => press(content, 'a'));
    expect(audio.play).not.toHaveBeenCalled();
    await act(async () => render(true, false, false));
    expect(audio.destroy).toHaveBeenCalled();
    await act(async () => press(content, 'a'));
    expect(audio.play).not.toHaveBeenCalled();
    await act(async () => render(true));
    await act(async () => press(content, 'a'));
    expect(audio.play).toHaveBeenCalledWith('key');
    audio.play.mockClear();
    await act(async () => render(false));
    expect(audio.destroy).toHaveBeenCalled();
    await act(async () => press(content, 'a'));
    expect(audio.play).not.toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount());
    host.remove();
    if (rects) Object.defineProperty(Range.prototype, 'getClientRects', rects);
    else Reflect.deleteProperty(Range.prototype, 'getClientRects');
    if (rect) Object.defineProperty(Range.prototype, 'getBoundingClientRect', rect);
    else Reflect.deleteProperty(Range.prototype, 'getBoundingClientRect');
    vi.unstubAllGlobals();
  }
});
