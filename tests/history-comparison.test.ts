import { expect, it } from 'vitest';
import { comparePassages, reprisePassage } from '../src/history/comparison';

it.each([
  ['Un matin clair.', 'Un matin gris.'],
  ['Premier.\n\nDernier.', 'Premier.\n\nAjout.\n\nDernier.'],
  ['Premier.\n\nRetiré.\n\nDernier.', 'Premier.\n\nDernier.'],
  ['', 'Un début.'],
  ['Un début.', ''],
  ['A\n\nB\n\nC\n\nD', 'X\n\nB\n\nY\n\nD'],
  ['A\n\n', 'A\n\n\n\n'],
])('reconstructs both texts and safely restores changed passages (%s)', (left, right) => {
  const rows = comparePassages(left, right);
  expect(rows.flatMap((r) => r.left).join('\n\n')).toBe(left);
  expect(rows.flatMap((r) => r.right).join('\n\n')).toBe(right);
  // Apply backwards so paragraph offsets remain valid.
  let restored = right;
  for (const row of [...rows].reverse()) if (row.changed) restored = reprisePassage(restored, row);
  expect(restored).toBe(left);
});
it('marks only changed words, preserving accents and punctuation', () => {
  const [row] = comparePassages('Élise attend au quai.', 'Élise revient au quai.');
  expect(
    row.words
      .filter((w) => w.removed)
      .map((w) => w.value)
      .join(''),
  ).toBe('attend');
  expect(
    row.words
      .filter((w) => w.added)
      .map((w) => w.value)
      .join(''),
  ).toBe('revient');
  expect(comparePassages('Identique.', 'Identique.').every((r) => !r.changed)).toBe(true);
});

it('recognizes scene structure and preparation changes without text edits', async () => {
  const { sectionChanges } = await import('../src/history/comparison');
  const base = {
    id: 'one', parent: null, title: 'Un', kind: 'scene' as const, position: 0,
    text: 'Même texte', revision: 0, synopsis: '', status: 'Brouillon', goal: 0,
    role: 'manuscript' as const, included: true,
  };
  const next = { ...base, parent: 'chapter', position: 2, role: 'note' as const,
    synopsis: 'Suite', status: 'Terminé', goal: 500, included: false,
    outline: { version: 1 as const, nodes: [{ id: 'n', parent: null, start: 0 }] },
  };
  expect(sectionChanges(base, next)).toEqual([
    'Emplacement modifié', 'Ordre modifié', 'Espace modifié',
    'Inclusion dans le manuscrit modifiée', 'Synopsis modifié',
    'Statut modifié', 'Objectif modifié', 'Plan du texte modifié',
  ]);
});
