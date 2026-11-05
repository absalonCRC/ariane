// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { history, undo } from '@codemirror/commands';
import { normalizedMatches } from '../src/editor/normalizedSearch';
import { citationChanges, prepareCitationInsertion } from '../src/editor/citationInsertion';
import { compose, sectionMapping } from '../src/editor/composite';
import { resolveAnnotation } from '../src/project/annotations';
import { type Annotation } from '../src/contracts/annotations';
import { newSection } from '../src/platform/client';

it('finds French accents, decomposed characters, apostrophes and ligatures with original UTF-16 offsets', () => {
  const text = "😀 E\u0301lise, Élise, l’œuvre et L'OEUVRE.";
  expect(normalizedMatches(text, 'elise').map((m) => text.slice(m.from, m.to))).toEqual([
    'E\u0301lise',
    'Élise',
  ]);
  expect(normalizedMatches(text, "l'oeuvre").map((m) => text.slice(m.from, m.to))).toEqual([
    'l’œuvre',
    "L'OEUVRE",
  ]);
});
it('inserts a quotation at the selection and retains note placement, stale guard and undo', () => {
  const first = {
    ...newSection('Un', null, 'scene'),
    text: 'Élise Martin rentra à Lyon.\n\nEnsuite elle écrivit.',
  };
  const second = { ...newSection('Deux', null, 'scene', 1), text: 'Un autre chapitre.' };
  const data = compose([first, second]),
    mapping = sectionMapping(data.spans);
  const view = new EditorView({
    state: EditorState.create({
      doc: data.text,
      selection: { anchor: 0, head: 12 },
      extensions: [history(), mapping.extensions],
    }),
  });
  const apply = prepareCitationInsertion(view, data.spans, () => view);
  expect(apply('\n\n> Paroles de la source[^x]\n\n[^x]: Source originale\n')).toBe(true);
  const spans = view.state.field(mapping.field);
  const text = view.state.sliceDoc(spans[0].from, spans[0].to);
  expect(text).toContain('> Paroles de la source[^x]');
  expect(text).not.toContain('Élise Martin');
  expect(text).toContain('rentra à Lyon.');
  expect(text.indexOf('[^x]:')).toBeGreaterThan(text.indexOf('Ensuite'));
  expect(view.state.sliceDoc(spans[1].from, spans[1].to)).toBe(second.text);
  expect(undo(view)).toBe(true);
  expect(view.state.doc.toString()).toBe(data.text);
  const stale = prepareCitationInsertion(view, view.state.field(mapping.field), () => view);
  view.dispatch({ changes: { from: 0, insert: 'Plus tard, ' } });
  expect(stale('[^x]\n\n[^x]: Source')).toBe(false);
  view.destroy();
});
it('replaces the selected text with an inline reference, keeping its definition at scene end', () => {
  const text = 'Élise rentra à Lyon.';
  const plan = citationChanges(text, 0, 5, '[^x]\n\n[^x]: Note\n');
  let result = text;
  for (const change of [...plan.changes].reverse())
    result = result.slice(0, change.from) + change.insert + result.slice(change.to);
  expect(result).toBe('[^x] rentra à Lyon.\n\n[^x]: Note\n');
});
it('reattaches annotations by exact context after movement and refuses ambiguous or edited quotes', () => {
  const a: Annotation = {
    id: 'a',
    section: 'old',
    quote: 'Élise',
    before: 'Bonjour ',
    after: '.',
    note: 'À vérifier',
    done: false,
    created: '',
    revision: 0,
  };
  const s = { ...newSection('Scène', null, 'scene'), id: 'new', text: 'Bonjour Élise.' };
  expect(resolveAnnotation(a, [s])?.section).toBe('new');
  expect(resolveAnnotation(a, [s, { ...s, id: 'copy' }])).toBeNull();
  expect(resolveAnnotation(a, [{ ...s, text: 'Bonjour André.' }])).toBeNull();
});

it('keeps inline references at scene boundaries in the owning scene', () => {
  const first = { ...newSection('Un', null, 'scene'), text: 'Premier.' };
  const second = { ...newSection('Deux', null, 'scene', 1), text: 'Second.' };
  const data = compose([first, second]),
    mapping = sectionMapping(data.spans);
  const view = new EditorView({
    state: EditorState.create({
      doc: data.text,
      selection: { anchor: data.spans[1].from },
      extensions: [history(), mapping.extensions],
    }),
  });
  prepareCitationInsertion(view, data.spans, () => view)('[^x]\n\n[^x]: Source\n');
  const spans = view.state.field(mapping.field);
  expect(view.state.sliceDoc(spans[0].from, spans[0].to)).toBe('Premier.\n\n');
  expect(view.state.sliceDoc(spans[1].from, spans[1].to)).toBe('[^x]Second.\n\n[^x]: Source\n');
  view.destroy();
});

it('does not simulate the withdrawn native features in the browser adapter', async () => {
  const { request } = await import('../src/platform/client');
  await request('create', { path: 'rollback-browser', name: 'Essai' });
  await expect(
    request('manuscriptOperation', {
      projectPath: 'rollback-browser',
      // @ts-expect-error Exercise a deliberately malformed native-only request.
      operation: { action: 'split' },
    }),
  ).rejects.toThrow('Mac');
  await expect(request('annotations', { projectPath: 'rollback-browser' })).rejects.toThrow('Mac');
  await expect(
    // @ts-expect-error Withdrawn commands must be rejected at compile time and runtime.
    request('replaceTexts', { projectPath: 'rollback-browser', patches: [] }),
  ).rejects.toThrow('Rust');
});
