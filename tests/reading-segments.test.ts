import { expect, it } from 'vitest';
import { readingSegments, wordTimings } from '../src/voice/readingSegments';

it.each(['fr', 'en', 'es'])(
  'preserves UTF-16 manuscript offsets and bounds long segments in %s',
  (language) => {
    const text = '  🪶 Élise attend.\n  ¿Dónde está? ' + 'élève '.repeat(80) + '𝒳'.repeat(101);
    const chunks = [...readingSegments(text, language)];
    expect(chunks.length).toBeGreaterThan(4);
    expect(
      chunks
        .map((c) => c.text)
        .join('')
        .replace(/\s/g, ''),
    ).toBe(text.replace(/\s/g, ''));
    for (const chunk of chunks) {
      expect(text.slice(chunk.offset, chunk.offset + chunk.text.length)).toBe(chunk.text);
      expect(chunk.text.length).toBeLessThanOrEqual(100);
      expect(chunk.text).not.toMatch(/^[\uDC00-\uDFFF]|[\uD800-\uDBFF]$/);
    }
  },
);

it('maps UTF-8 token boundaries onto complete accented words, skipping punctuation', () => {
  const text = '🪶 E\u0301lise, aquí.';
  const words = wordTimings({ text, offset: 9 }, 'es', [
    [0, 0],
    [4, 120],
    [6, 180],
    [10, 300],
    [13, 530],
    [16, 610],
  ]);
  expect(words.map((w) => [text.slice(w.from - 9, w.from - 9 + w.length), w.ms])).toEqual([
    ['E\u0301lise', 120],
    ['aquí', 530],
  ]);
});

it('skips selections containing only spaces and punctuation', () => {
  expect([...readingSegments('…\n   !', 'fr')]).toEqual([]);
});
