// @vitest-environment jsdom
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { markdown } from '@codemirror/lang-markdown';
import { describe, expect, it } from 'vitest';
import { reviewTarget } from '../src/editor/reviewTarget';
import { reviewSuggestions } from '../src/revision/suggestions';

const suggestion = {
  from: 4,
  to: 10,
  original: 'enfant',
  replacement: 'enfants',
  message: 'Accord',
  source: 'language' as const,
};
describe('application d’une correction', () => {
  it('applique seulement la suggestion choisie et refuse les résultats périmés', () => {
    const view = new EditorView({
      state: EditorState.create({ doc: 'Les enfant jouent.', extensions: [markdown()] }),
      parent: document.body,
    });
    const target = reviewTarget(view, [{ id: '1', from: 0, to: 18, title: '' }], () => view)!;
    expect(target.apply(suggestion)).toBe(true);
    expect(view.state.doc.toString()).toBe('Les enfants jouent.');
    expect(target.apply(suggestion)).toBe(false);
    view.destroy();
  });
  it('refuse une sélection qui traverse des scènes', () => {
    const view = new EditorView({
      state: EditorState.create({ doc: 'Un\n\nDeux', selection: { anchor: 1, head: 7 } }),
      parent: document.body,
    });
    const spans = [
      { id: '1', from: 0, to: 4, title: '' },
      { id: '2', from: 4, to: 8, title: '' },
    ];
    expect(reviewTarget(view, spans, () => view)).toBeNull();
    view.destroy();
  });
  it('refuse un passage situé à l’intérieur du code ou d’un lien Markdown', () => {
    for (const doc of ['```\nLes enfant jouent.\n```', '[Les enfant](https://exemple.fr)']) {
      const from = doc.indexOf('enfant');
      const view = new EditorView({
        state: EditorState.create({
          doc,
          selection: { anchor: from, head: from + 6 },
          extensions: [markdown()],
        }),
        parent: document.body,
      });
      expect(
        reviewTarget(view, [{ id: '1', from: 0, to: doc.length, title: '' }], () => view),
      ).toBeNull();
      view.destroy();
    }
  });
  it('protège le lien complet même si un passage plus long est vérifié', () => {
    const doc = 'Voir [les enfant](https://exemple.fr/page_(1)) ici.';
    const view = new EditorView({
      state: EditorState.create({ doc, extensions: [markdown()] }),
      parent: document.body,
    });
    const target = reviewTarget(
      view,
      [{ id: '1', from: 0, to: doc.length, title: '' }],
      () => view,
    )!;
    const offset = doc.indexOf('enfant');
    expect(
      reviewSuggestions(
        target.text,
        [{ offset, length: 6, message: 'Accord', replacements: ['enfants'] }],
        null,
        target.protected,
      ),
    ).toEqual([]);
    view.destroy();
  });
});
