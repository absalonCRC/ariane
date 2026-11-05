import { describe, expect, it } from 'vitest';
import { searchManuscript } from '../src/app/projectSearch';
import type { Section } from '../src/contracts/project';
const section = (id: string, text: string, extras: Partial<Section> = {}): Section => ({
  id,
  title: id,
  text,
  kind: 'scene',
  parent: null,
  position: 0,
  revision: 0,
  synopsis: '',
  status: '',
  goal: 0,
  ...extras,
});
describe('unified manuscript search', () => {
  it('returns exact offsets for every occurrence across texts and legacy notes, excluding trash', () => {
    const sections = [
      section('a', '🌙 Lune et lune'),
      section('b', 'Une LUNE', { role: 'note', position: 1, included: false }),
      section('trash', 'lune', { trashed: true }),
    ];
    const result = searchManuscript(sections, 'lune');
    expect(result.total).toBe(3);
    expect(result.items.map((s) => [s.section, s.from, s.to])).toEqual([
      ['a', 3, 7],
      ['a', 11, 15],
      ['b', 4, 8],
    ]);
    for (const hit of result.items)
      expect(
        sections
          .find((s) => s.id === hit.section)!
          .text.slice(hit.from!, hit.to!)
          .toLowerCase(),
      ).toBe('lune');
  });
  it('treats regex punctuation literally and supports title-only results', () => {
    expect(
      searchManuscript([section('titre', 'Un [lieu] et autre')], '[lieu]').items[0],
    ).toMatchObject({ from: 3, to: 9 });
    expect(searchManuscript([section('Lune', 'Autre')], 'lune').items[0].from).toBeNull();
    expect(searchManuscript([section('Lune', 'Lune')], '  ').total).toBe(0);
  });
  it('keeps full counts while bounding displayed results', () => {
    const result = searchManuscript([section('a', 'lune '.repeat(210))], 'lune');
    expect(result.total).toBe(210);
    expect(result.items).toHaveLength(200);
  });
});
