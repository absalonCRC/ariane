import { expect, it } from 'vitest';
import { passageExcerpt, plainExcerpt } from '../src/enrichment/excerpts';
import type { Section } from '../src/contracts/project';
it('keeps useful table text and avoids separator noise', () => {
  expect(plainExcerpt('| Personne | Lieu |\n| --- | --- |\n| Élise | Lyon |')).toBe(
    'Personne · Lieu Élise · Lyon',
  );
  expect(plainExcerpt('| --- | --- |')).toBe('Tableau de 2 colonnes');
  expect(plainExcerpt('**Bonjour** [Élise](source.md)')).toBe('Bonjour Élise');
});

it('quotes the persisted outline passage near the saved cursor', () => {
  const text =
    'La porte était close.\n\nÉlise attendait dans le jardin.\nUn oiseau chantait.\nSuite.';
  const section = {
    id: 's',
    parent: null,
    title: 'Scène',
    kind: 'scene',
    position: 0,
    text,
    revision: 1,
    synopsis: '',
    status: '',
    goal: 0,
    outline: {
      version: 1,
      nodes: [
        { id: 'a', parent: null, start: 0 },
        { id: 'b', parent: null, start: text.indexOf('Élise') },
      ],
    },
  } satisfies Section;
  expect(passageExcerpt(section, 'b', 4)).toContain('Élise attendait');
  expect(passageExcerpt(section, 'a', 0)).toBe('La porte était close.');
  expect(passageExcerpt({ ...section, outline: null }, null, text.indexOf('Élise'))).toContain(
    'Élise attendait',
  );
});
