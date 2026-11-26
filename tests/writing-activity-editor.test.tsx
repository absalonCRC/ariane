// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { EditorView } from '@codemirror/view';
import { undo, redo } from '@codemirror/commands';
import { expect, it, vi } from 'vitest';
import { Editor } from '../src/editor/Editor';
import { defaultSettings } from '../src/contracts/settings';
import type { Section } from '../src/contracts/project';
vi.mock('../src/capture/preferences', () => ({ useCapturePreferences: () => ({ volume: 1 }) }));
it('records manuscript transactions and undo/redo, without replaying on mount, reconfiguration, or project switch', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
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
  const root = createRoot(host);
  const session = vi.fn();
  const activity = vi.fn(),
    noop = () => {};
  const section: Section = {
    id: 's',
    parent: null,
    title: 'Page',
    kind: 'scene',
    position: 0,
    text: 'Un mot',
    revision: 0,
    synopsis: '',
    status: '',
    goal: 0,
  };
  const render = (path = 'synthetic', fontSize = 26) => (
    <Editor
      sections={[section]}
      projectPath={path}
      generation={0}
      settings={{ ...defaultSettings, fontSize }}
      onChange={noop}
      onVisible={noop}
      onWords={noop}
      onCharacters={noop}
      onCursor={noop}
      onTyping={noop}
      onWritingEdit={activity}
      writingBranch="main"
      onSessionChange={session}
    />
  );
  try {
    await act(async () => root.render(render()));
    expect(activity).not.toHaveBeenCalled();
    const view = EditorView.findFromDOM(host.querySelector('.cm-editor') as HTMLElement)!;
    await act(async () =>
      view.dispatch({ changes: { from: view.state.doc.length, insert: ' nouveau' } }),
    );
    expect(activity.mock.calls.map(([delta]) => delta)).toEqual([1]);
    expect(session.mock.calls.at(-1)?.[0].lastEdit).toMatchObject({
      section: 's',
      position: 14,
      branch: 'main',
    });
    session.mockClear();
    await act(async () => view.dispatch({ selection: { anchor: 2 } }));
    expect(session.mock.calls.at(-1)?.[0].writingPosition.position).toBe(2);
    expect(session.mock.calls.some(([patch]) => 'lastEdit' in patch)).toBe(false);
    await act(async () => {
      undo(view);
    });
    await act(async () => {
      redo(view);
    });
    expect(activity.mock.calls.map(([delta]) => delta)).toEqual([1, -1, 1]);
    activity.mockClear();
    await act(async () => root.render(render('synthetic', 24)));
    await act(async () => root.render(render('another-project', 24)));
    expect(activity).not.toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount());
    host.remove();
    if (rects) Object.defineProperty(Range.prototype, 'getClientRects', rects);
    else delete (Range.prototype as Partial<Range>).getClientRects;
    if (rect) Object.defineProperty(Range.prototype, 'getBoundingClientRect', rect);
    else delete (Range.prototype as Partial<Range>).getBoundingClientRect;
    vi.unstubAllGlobals();
  }
});
