// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { annotationGroups, captureAnchor, inspectAnchor } from '../src/project/annotations';
import { newSection } from '../src/platform/browser/client';
const scene = { ...newSection('Scène', null, 'scene'), text: 'Élise rit. Élise rit.' };
const note = (id: string, from: number, to: number) => ({
  ...captureAnchor(scene, from, to),
  id,
  created: id,
  revision: 0,
  done: false,
  note: id,
});
it('groups subranges by sentence and preserves two identical sentences', () => {
  const first = note('A', 0, 5),
    second = note('B', 6, 9),
    other = note('C', 11, 16);
  expect(
    annotationGroups([other, second, first], [scene], 'fr').map((g) => g.map((a) => a.id)),
  ).toEqual([['A', 'B'], ['C']]);
});
it('signals overlapping ambiguous matches and does not follow an unrelated duplicate', () => {
  const base = { ...scene, text: 'aaaa' };
  expect(inspectAnchor({ section: base.id, quote: 'aa', before: '', after: '' }, [base])).toEqual({
    match: null,
    ambiguous: true,
  });
  const target = captureAnchor(scene, 0, 5);
  expect(
    inspectAnchor(target, [
      { ...scene, text: 'Elle partit. Élise sort.', revision: scene.revision + 1 },
    ]).match,
  ).toBeNull();
});
