// @vitest-environment jsdom
import { EditorState } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { defaultKeymap, history, undo } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { autocompletion } from '@codemirror/autocomplete';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { nextWord, refreshPrediction, type PredictionConfiguration } from '../src/editor/nextWord';

const request = vi.hoisted(() => vi.fn());
vi.mock('../src/platform/client', () => ({ native: false, request }));

const proposal = { word: 'écluse', feedback: 'witness', epoch: 0 };
let view: EditorView | undefined;
let host: HTMLElement | undefined;
const hint = () => host?.querySelector('.cm-predicted-word')?.textContent;
function editor(
  text: string,
  configuration: () => PredictionConfiguration | null,
  withCompletion = false,
) {
  host = document.body.appendChild(document.createElement('div'));
  view = new EditorView({
    parent: host,
    state: EditorState.create({
      doc: text,
      selection: { anchor: text.length },
      extensions: [
        history(),
        keymap.of(defaultKeymap),
        nextWord(configuration),
        markdown(),
        ...(withCompletion ? [autocompletion({ override: [() => null] })] : []),
      ],
    }),
  });
  view.focus();
  return view;
}
function type(view: EditorView, text: string, userEvent = 'input.type') {
  const at = view.state.selection.main.head;
  view.dispatch({
    changes: { from: at, insert: text },
    selection: { anchor: at + text.length },
    userEvent,
  });
}
function key(view: EditorView, key: string, other: KeyboardEventInit = {}) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...other });
  view.contentDOM.dispatchEvent(event);
  return event.defaultPrevented;
}

beforeEach(() => {
  vi.useFakeTimers();
  request.mockReset().mockResolvedValue(proposal);
});
afterEach(() => {
  view?.destroy();
  host?.remove();
  localStorage.removeItem('ariane.shortcuts.v1');
  vi.useRealTimers();
});

it('shows one inline word, accepts with Enter and undoes just the insertion', async () => {
  const v = editor('Maëlys tient l’', () => ({
    language: 'fr',
    distinct: false,
    projectPath: 'test',
    epoch: 0,
  }));
  type(v, 'ancien ');
  await vi.advanceTimersByTimeAsync(155);
  expect(hint()).toBe('écluse');
  expect(host?.querySelector('.cm-line .cm-predicted-word')).not.toBeNull();
  expect(v.state.doc.toString()).toBe('Maëlys tient l’ancien ');
  expect(key(v, 'Tab')).toBe(false);
  expect(key(v, 'Enter')).toBe(true);
  expect(v.state.doc.toString()).toBe('Maëlys tient l’ancien écluse');
  expect(hint()).toBeUndefined();
  expect(request).toHaveBeenLastCalledWith('predictionFeedback', {
    projectPath: 'test',
    token: 'witness',
    epoch: 0,
    accepted: true,
  });
  expect(undo(v)).toBe(true);
  expect(v.state.doc.toString()).toBe('Maëlys tient l’ancien ');
  key(v, 'Enter');
  expect(v.state.doc.toString()).toBe('Maëlys tient l’ancien \n');
});

it('respects an explicit remapping and gives Enter back to the editor', async () => {
  const v = editor('La vieille', () => ({ language: 'fr', distinct: false, epoch: 0 }));
  localStorage.setItem('ariane.shortcuts.v1', JSON.stringify({ 'prediction-accept': 'Mod+Alt+J' }));
  type(v, ' ');
  await vi.advanceTimersByTimeAsync(155);
  expect(key(v, 'j', { metaKey: true, altKey: true })).toBe(true);
  expect(v.state.doc.toString()).toBe('La vieille écluse');
});

it('rejects in capture without an edit or project reference', async () => {
  const v = editor('La vieille', () => ({ language: 'fr', distinct: true, epoch: 0 }));
  type(v, ' ');
  await vi.advanceTimersByTimeAsync(155);
  expect(hint()).toBe('écluse');
  expect(host?.querySelector('.cm-predicted-word')?.getAttribute('data-distinct')).toBe('true');
  expect(key(v, 'Escape')).toBe(true);
  expect(v.state.doc.toString()).toBe('La vieille ');
  expect(request).toHaveBeenLastCalledWith('predictionFeedback', {
    projectPath: undefined,
    token: 'witness',
    epoch: 0,
    accepted: false,
  });
  expect(hint()).toBeUndefined();
});

it('discards replies after changing context, selecting, or resetting the corpus', async () => {
  let resolve!: (value: typeof proposal) => void;
  request.mockReturnValueOnce(
    new Promise((res) => {
      resolve = res;
    }),
  );
  let configuration: PredictionConfiguration = {
    language: 'fr',
    distinct: false,
    projectPath: 'a',
    epoch: 0,
  };
  const v = editor('La porte', () => configuration);
  type(v, ' ');
  await vi.advanceTimersByTimeAsync(155);
  configuration = { ...configuration, projectPath: 'b' };
  v.dispatch({ selection: { anchor: 0, head: 4 }, effects: refreshPrediction.of() });
  resolve(proposal);
  await vi.advanceTimersByTimeAsync(0);
  expect(hint()).toBeUndefined();
  v.dispatch({ selection: { anchor: v.state.doc.length } });
  type(v, ' ');
  await vi.advanceTimersByTimeAsync(155);
  expect(hint()).toBe('écluse');
  configuration = { ...configuration, epoch: 1 };
  v.dispatch({ effects: refreshPrediction.of() });
  expect(hint()).toBeUndefined();
  expect(key(v, 'ArrowDown', { metaKey: true, altKey: true })).toBe(false);
});

it('pauses during composition and in code', async () => {
  const v = editor('```text\nUne vieille', () => ({ language: 'fr', distinct: false, epoch: 0 }));
  type(v, ' ');
  await vi.advanceTimersByTimeAsync(155);
  expect(request).not.toHaveBeenCalled();
  type(v, '\n```\nLa vieille');
  type(v, ' ', 'input.type.compose');
  await vi.advanceTimersByTimeAsync(155);
  expect(request).not.toHaveBeenCalled();
  type(v, ' ');
  await vi.advanceTimersByTimeAsync(155);
  expect(hint()).toBe('écluse');
  v.contentDOM.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
  await vi.advanceTimersByTimeAsync(0);
  expect(hint()).toBeUndefined();
});

it('coexists with autocomplete waiting for a note query that produces no result', async () => {
  const v = editor('La vieille', () => ({ language: 'fr', distinct: false, epoch: 0 }), true);
  type(v, ' ');
  v.dispatch({ selection: v.state.selection });
  await vi.advanceTimersByTimeAsync(250);
  expect(hint()).toBe('écluse');
});
