// @vitest-environment jsdom
import { act, createRef } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { Editor, type EditorHandle } from '../src/editor/Editor';
import { defaultSettings } from '../src/contracts/settings';
import { type Section } from '../src/contracts/project';
it('opens the exact original node, including a folded child with identical text elsewhere', async () => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
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
    editor = createRef<EditorHandle>(),
    changed = vi.fn();
  const text = 'Parent\nClaude Nougaro\nClaude Nougaro';
  const section: Section = {
    id: 'scene',
    parent: null,
    kind: 'scene',
    position: 0,
    title: 'Scène',
    text,
    revision: 1,
    synopsis: '',
    status: '',
    goal: 0,
    outline: {
      version: 1,
      nodes: [
        { id: 'parent', parent: null, start: 0 },
        { id: 'child', parent: 'parent', start: 7 },
        { id: 'other', parent: null, start: 22 },
      ],
    },
  };
  try {
    await act(async () =>
      root.render(
        <Editor
          ref={editor}
          sections={[section]}
          generation={1}
          settings={defaultSettings}
          onChange={changed}
          onVisible={vi.fn()}
          onWords={vi.fn()}
          onCharacters={vi.fn()}
          onCursor={vi.fn()}
          onTyping={vi.fn()}
        />,
      ),
    );
    await act(async () => editor.current!.structure('fold'));
    expect(host.querySelector('.cm-editor')).not.toBeNull();
    await act(async () => {
      expect(editor.current!.revealNode('other')).toBe(true);
    });
    expect(editor.current!.cursor()).toBe(22);
    await act(async () => {
      expect(editor.current!.revealNode('child')).toBe(true);
    });
    expect(editor.current!.cursor()).toBe(7);
    expect(editor.current!.text()).toBe(text);
    expect(changed).not.toHaveBeenCalled();
    expect(editor.current!.revealNode('deleted')).toBe(false);
  } finally {
    await act(async () => root.unmount());
    host.remove();
    if (rects) Object.defineProperty(Range.prototype, 'getClientRects', rects);
    else delete (Range.prototype as unknown as Record<string, unknown>).getClientRects;
    if (rect) Object.defineProperty(Range.prototype, 'getBoundingClientRect', rect);
    else delete (Range.prototype as unknown as Record<string, unknown>).getBoundingClientRect;
  }
});
