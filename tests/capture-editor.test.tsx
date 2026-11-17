// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { EditorView } from '@codemirror/view';
import { undo } from '@codemirror/commands';
import { expect, it, vi } from 'vitest';
import { CaptureEditor } from '../src/capture/CaptureEditor';
import type { InboxCapture } from '../src/contracts/inbox';
const audio = vi.hoisted(() => ({ play: vi.fn(), destroy: vi.fn(), setVolume: vi.fn() }));
vi.mock('../src/editor/typewriterSound', () => ({ createTypewriterSound: () => audio }));
vi.mock('@tauri-apps/api/event', () => ({ listen: async () => () => {} }));

it('keeps the document, UTF-16 selection and undo history through preference changes and silences hidden captures', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.stubGlobal('matchMedia', () => ({
    matches: true,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
  }));
  const rects = Object.getOwnPropertyDescriptor(Range.prototype, 'getClientRects');
  const rect = Object.getOwnPropertyDescriptor(Range.prototype, 'getBoundingClientRect');
  Object.defineProperty(Range.prototype, 'getClientRects', { configurable: true, value: () => [] });
  Object.defineProperty(Range.prototype, 'getBoundingClientRect', {
    configurable: true,
    value: () => new DOMRect(),
  });
  const capture: InboxCapture = {
    id: 'one',
    text: 'Été 🌿',
    revision: 1,
    createdAt: '',
    updatedAt: '',
    status: 'draft',
    selection: { anchor: 6, head: 6 },
    destination: null,
  };
  const change = vi.fn(),
    finish = vi.fn(),
    hide = vi.fn();
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const render = (volume = 1, visible = true, readOnly = false) =>
    root.render(
      <CaptureEditor
        capture={capture}
        onChange={change}
        onFinish={finish}
        onHide={hide}
        readOnly={readOnly}
        visible={visible}
        preferences={{ shortcut: null, volume, sound: true, typewriter: true }}
      />,
    );
  const press = (key: string, extra: KeyboardEventInit = {}) =>
    host
      .querySelector('.cm-content')!
      .dispatchEvent(
        new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...extra }),
      );
  try {
    await act(async () => render());
    const dom = host.querySelector<HTMLElement>('.cm-editor')!,
      view = EditorView.findFromDOM(dom)!;
    expect(view.state.selection.main.head).toBe(6);
    await act(async () =>
      view.dispatch({
        changes: { from: 6, insert: ' demain' },
        selection: { anchor: 13 },
        userEvent: 'input',
      }),
    );
    expect(change).toHaveBeenLastCalledWith('Été 🌿 demain', { anchor: 13, head: 13 });
    await act(async () => render(0.25));
    expect(host.querySelector('.cm-editor')).toBe(dom);
    expect(audio.setVolume).toHaveBeenLastCalledWith(0.25);
    await act(async () => undo(view));
    expect(view.state.doc.toString()).toBe('Été 🌿');
    audio.play.mockClear();
    await act(async () => {
      press('a');
      press(' ');
      press('Enter');
      press('Dead');
      press('a', { isComposing: true });
      press('v', { metaKey: true });
    });
    expect(audio.play.mock.calls.map(([kind]) => kind)).toEqual(['key', 'space', 'return']);
    await act(async () => render(0.25, true, true));
    audio.play.mockClear();
    change.mockClear();
    await act(async () => {
      press('a');
      view.dispatch({ selection: { anchor: 0 } });
    });
    expect(audio.play).not.toHaveBeenCalled();
    expect(change).not.toHaveBeenCalled();
    await act(async () => render(0.25, false));
    expect(audio.destroy).toHaveBeenCalled();
    expect(host.querySelector('.cm-editor')).toBe(dom);
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
