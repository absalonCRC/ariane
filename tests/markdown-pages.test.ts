import { expect, it } from 'vitest';
import { markdownPages, PAGE_SIZE } from '../src/sources/markdownPages';
it('paginates at block boundaries, keeps references and bounds giant blocks', () => {
  const source =
    'Un paragraphe avec [une note][a].\n\n'.repeat(2000) +
    '[a]: https://example.org\n\n```txt\n' +
    'x'.repeat(PAGE_SIZE * 3) +
    '\n```';
  const result = markdownPages(source);
  expect(result.pages.length).toBeGreaterThan(4);
  expect(result.definitions).toContain('[a]:');
  expect(result.pages.every((p) => p.to - p.from <= PAGE_SIZE)).toBe(true);
  expect(result.pages.map((p) => source.slice(p.from, p.to)).join('')).toBe(source);
  expect(result.pages.some((p) => p.plain)).toBe(true);
});
