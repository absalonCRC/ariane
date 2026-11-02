import { expect, it } from 'vitest';
import { marginLayout } from '../src/sources/marginLayout';
import type { Source } from '../src/app/types';
const source = (id: string) => ({ id }) as Source;
const groups = [
  { id: 1, top: 100, sources: [source('a'), source('b')] },
  { id: 2, top: 230, sources: [source('c')] },
];
it('reserves the expanded source height and pushes following groups down', () => {
  const expanded = marginLayout(groups, null, 'a', 400);
  expect(expanded[0]).toMatchObject({ top: 100, height: 454 });
  expect(expanded[1].top).toBe(566);
  expect(marginLayout(groups, null, undefined, 400)[1].top).toBe(230);
});
it('keeps all revealed sources in the layout and respects later passage anchors', () => {
  const many = { id: 1, top: 100, sources: Array.from({ length: 8 }, (_, i) => source(String(i))) };
  const result = marginLayout([many, groups[1]], 1, '3', 420);
  expect(result[0].height).toBe(822);
  expect(result[1].top).toBe(934);
  expect(
    marginLayout(
      [
        { ...groups[0], top: 50 },
        { ...groups[1], top: 900 },
      ],
      null,
      'a',
      400,
    )[1].top,
  ).toBe(900);
  expect(marginLayout([many], null, '7', 420)[0].height).toBe(132);
});
