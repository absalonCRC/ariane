import { expect, it } from 'vitest';
import { sourceOccurrences } from '../src/sources/occurrences';
import { composeCitation } from '../src/sources/citations';
import type { Section } from '../src/contracts/project';
import type { Source } from '../src/contracts/sources';
const source: Source = {
  id: '0123456789-entity',
  fingerprint: 'abcdef012345',
  vaultId: 'v',
  title: 'Élise',
  aliases: ['Lise', 'Élise Martin'],
  kind: 'Personne',
  fields: {},
  tags: [],
  text: '',
  path: 'Élise.md',
  matched: null,
  page: null,
  score: 0,
};
const scene = (id: string, text: string, extra: Partial<Section> = {}): Section => ({
  id,
  text,
  title: id,
  parent: null,
  position: 0,
  kind: 'scene',
  revision: 0,
  synopsis: '',
  status: '',
  goal: 0,
  ...extra,
});
it('finds whole names and aliases with original unicode offsets, including working texts and excluding trash', () => {
  const text = '🌙 Élise Martin arrive. La valise de LISE attend Élise.';
  const hits = sourceOccurrences(
    [scene('a', text, { included: false }), scene('trash', 'Élise', { trashed: true })],
    source,
  );
  expect(hits.map((h) => h.matched)).toEqual(['Élise Martin', 'LISE', 'Élise']);
  expect(hits.map((h) => h.kind)).toEqual(['mention', 'mention', 'mention']);
  for (const hit of hits) expect(text.slice(hit.from!, hit.to!)).toBe(hit.matched);
});
it('finds explicit citations from older source fingerprints once, skipping footnote definitions', () => {
  const old = { ...source, fingerprint: 'old0123456' };
  const text = composeCitation(old, 'Un passage.', 'notes') + composeCitation(old, '', 'apa');
  const hits = sourceOccurrences([scene('a', text)], source);
  expect(hits).toHaveLength(2);
  expect(hits.every((h) => h.matched.startsWith('['))).toBe(true);
  expect(hits.map((h) => h.kind)).toEqual(['reference', 'reference']);
});
it('escapes names containing regexp syntax and preserves manuscript order', () => {
  const hits = sourceOccurrences(
    [scene('b', 'A+B', { position: 2 }), scene('a', 'A+B', { position: 1 })],
    { ...source, title: 'A+B', aliases: [] },
  );
  expect(hits.map((h) => h.section)).toEqual(['a', 'b']);
});
it('keeps homonymous titles as unconfirmed mentions and rejects substrings inside words', () => {
  const text = 'Élise croise Élise. Élisement, XÉlise et Élise2 ne désignent personne.';
  const hits = sourceOccurrences([scene('a', text)], source);
  expect(hits.map((hit) => [hit.matched, hit.kind])).toEqual([
    ['Élise', 'mention'],
    ['Élise', 'mention'],
  ]);
});
it('skips Markdown code and footnote definitions but keeps prose citations and exact offsets', () => {
  const ref = 'source-0123456789-old01234';
  const text = [
    `🌙 Élise [@${ref}, p. 2] et [^${ref}-a1b2c3].`,
    `[^${ref}-a1b2c3]: Élise, dans la bibliographie.`,
    '    Élise dans un bloc indenté',
    `\`Élise [@${ref}]\` reste du code.`,
    '~~~md',
    `Élise [@${ref}]`,
    '~~~',
    'Élise revient.',
  ].join('\n');
  const hits = sourceOccurrences([scene('a', text)], source);
  expect(hits.map((hit) => [hit.matched, hit.kind])).toEqual([
    ['Élise', 'mention'],
    [`[@${ref}, p. 2]`, 'reference'],
    [`[^${ref}-a1b2c3]`, 'reference'],
    ['Élise', 'mention'],
  ]);
  for (const hit of hits) expect(text.slice(hit.from!, hit.to!)).toBe(hit.matched);
});
