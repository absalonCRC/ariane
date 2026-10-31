// @vitest-environment jsdom
import { act, createRef } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { Editor, type EditorHandle } from '../src/editor/Editor';
import { defaultSettings, type Section } from '../src/app/types';

describe('éditeur d’un dossier vide', () => {
  it('attend une première scène avant d’autoriser l’écriture', async () => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    const host = document.createElement('div');
    const clientRects = Object.getOwnPropertyDescriptor(Range.prototype, 'getClientRects');
    const boundingRect = Object.getOwnPropertyDescriptor(Range.prototype, 'getBoundingClientRect');
    Object.defineProperty(Range.prototype, 'getClientRects', {
      configurable: true,
      value: () => [],
    });
    Object.defineProperty(Range.prototype, 'getBoundingClientRect', {
      configurable: true,
      value: () => new DOMRect(),
    });
    document.body.append(host);
    const root = createRoot(host);
    const editor = createRef<EditorHandle>();
    const onChange = vi.fn();
    const onWords = vi.fn();
    const props = {
      generation: 1,
      settings: defaultSettings,
      onChange,
      onVisible: vi.fn(),
      onWords,
      onCharacters: vi.fn(),
      onCursor: vi.fn(),
      onTyping: vi.fn(),
    };
    const scene: Section = {
      id: 'page',
      parent: 'folder',
      kind: 'scene',
      position: 0,
      title: 'Page',
      text: '',
      revision: 0,
      synopsis: '',
      status: '',
      goal: 0,
    };
    try {
      await act(async () => root.render(<Editor {...props} sections={[]} ref={editor} />));
      expect(host.querySelector('.cm-editor')).toBeNull();
      expect(editor.current?.prepareInsertion()('texte')).toBe(false);
      expect(onWords).toHaveBeenLastCalledWith(0);
      await act(async () => root.render(<Editor {...props} sections={[scene]} ref={editor} />));
      expect(host.querySelector('.cm-editor')).not.toBeNull();
      await act(async () => editor.current?.insert('Bonjour'));
      expect(editor.current?.text()).toBe('Bonjour');
      expect(onChange.mock.calls.at(-1)?.[0].get('page')).toBe('Bonjour');
      await act(async () => root.render(<Editor {...props} sections={[]} ref={editor} />));
      expect(host.querySelector('.cm-editor')).toBeNull();
      expect(onWords).toHaveBeenLastCalledWith(0);
      await act(async () =>
        root.render(<Editor {...props} sections={[{ ...scene, text: 'Bonjour' }]} ref={editor} />),
      );
      expect(editor.current?.text()).toBe('Bonjour');
    } finally {
      await act(async () => root.unmount());
      host.remove();
      if (clientRects) Object.defineProperty(Range.prototype, 'getClientRects', clientRects);
      else Reflect.deleteProperty(Range.prototype, 'getClientRects');
      if (boundingRect)
        Object.defineProperty(Range.prototype, 'getBoundingClientRect', boundingRect);
      else Reflect.deleteProperty(Range.prototype, 'getBoundingClientRect');
    }
  });
});
