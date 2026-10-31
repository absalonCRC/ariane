import { describe, expect, it } from 'vitest';
import { ordered, sectionPath } from '../src/project/tree';
import type { Section } from '../src/app/types';
const section = (id: string, title: string, parent: string | null): Section => ({
  id,
  title,
  parent,
  kind: 'scene',
  position: 0,
  text: '',
  revision: 0,
  synopsis: '',
  status: '',
  goal: 0,
});
describe('section path', () => {
  it('orders siblings and descendants without mutating input', () => {
    const a = section('a', 'A', null),
      b = section('b', 'B', null);
    a.position = 2;
    const child = section('child', 'Child', 'b');
    const input = [a, child, b];
    expect(ordered(input).map((s) => s.id)).toEqual(['b', 'child', 'a']);
    expect(ordered(input, 'b')).toEqual([child]);
    expect(input).toEqual([a, child, b]);
  });
  it('walks very deep hierarchies without exhausting the call stack', () => {
    const sections = Array.from({ length: 12000 }, (_, i) =>
      section(String(i), String(i), i ? String(i - 1) : null),
    );
    expect(ordered(sections)).toEqual(sections);
  });
  it('shows the complete hierarchy in order', () => {
    const a = section('a', 'Partie', null),
      b = section('b', 'Chapitre', 'a'),
      c = section('c', 'Scène', 'b');
    expect(sectionPath([a, b, c], c)).toEqual(['Partie', 'Chapitre', 'Scène']);
  });
  it('terminates if data contains a cycle', () => {
    const a = section('a', 'A', 'b'),
      b = section('b', 'B', 'a');
    expect(sectionPath([a, b], a)).toEqual(['B', 'A']);
  });
});
